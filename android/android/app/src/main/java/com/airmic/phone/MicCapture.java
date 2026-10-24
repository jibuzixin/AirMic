package com.airmic.phone;

import android.annotation.SuppressLint;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaRecorder;
import android.util.Log;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;

/**
 * 麦克风采集 → Opus 编码 → UDP 推流。
 *
 * <p>链路：{@code AudioRecord(48kHz/单声道/PCM16) → MediaCodec(Opus) → UDP}。
 * <p>每包 6 字节头：{@code seq(u16) + ts(u32 微秒)}，后接 Opus 帧，
 * 协议见 {@code shared/protocol.md}。
 */
public class MicCapture {

    private static final String TAG = "AirMicMic";

    /**
     * 编码格式：AAC-LC。
     *
     * <p>为什么不用 Opus：macOS 的 AudioConverter 不支持 Opus 解码，
     * 要用 Opus 就得把 libopus 源码打包进 App。AAC-LC 两端都原生支持，零依赖。
     */
    private static final String MIME = MediaFormat.MIMETYPE_AUDIO_AAC;
    private static final int SAMPLE_RATE = 48000;
    private static final int CHANNELS = 1;
    private static final int BITRATE = 32000;
    /** AAC-LC 一帧固定 1024 个采样（48kHz 下约 21.3ms） */
    private static final int FRAME_SAMPLES = 1024;
    /** 音频 UDP 端口（与控制端口分开，见 shared/protocol.md） */
    public static final int AUDIO_PORT = 47472;

    private Thread worker;
    private volatile boolean running = false;
    private volatile String mode = "idle";

    private AudioRecord audioRecord;
    private MediaCodec encoder;
    private DatagramSocket socket;
    private InetAddress target;
    private int targetPort;

    private int sequence = 0;

    /** 开始采集。mode: continuous（常开）/ ptt（瞬时说话） */
    public synchronized void start(String mode, String host, int port) throws IOException {
        stop();
        this.mode = mode;
        this.target = InetAddress.getByName(host);
        this.targetPort = port;
        running = true;

        worker = new Thread(this::loop, "airmic-mic");
        worker.setDaemon(true);
        worker.start();
    }

    public synchronized void stop() {
        running = false;
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }
        releaseAudio();
        releaseEncoder();
    }

    public boolean isRunning() {
        return running;
    }

    public String mode() {
        return mode;
    }

    private void loop() {
        try {
            socket = new DatagramSocket();
        } catch (IOException e) {
            Log.e(TAG, "UDP socket 创建失败：" + e.getMessage());
            return;
        }

        try {
            setupAudioRecord();
            setupEncoder();
            pump();
        } catch (Exception e) {
            Log.e(TAG, "采集失败：" + e.getMessage());
        } finally {
            releaseAudio();
            releaseEncoder();
            running = false;
        }
    }

    @SuppressLint("MissingPermission")
    private void setupAudioRecord() throws IOException {
        int minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuffer <= 0) throw new IOException("设备不支持 48kHz 单声道录音");

        // 依次尝试几个录音源：MIC 最稳（有些机型上 VOICE_RECOGNITION 会拿到静音）
        int[] sources = {
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        };
        IOException lastError = null;
        for (int source : sources) {
            AudioRecord record = new AudioRecord(
                source,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuffer * 4
            );
            if (record.getState() == AudioRecord.STATE_INITIALIZED) {
                audioRecord = record;
                break;
            }
            record.release();
            lastError = new IOException("麦克风打开失败（权限被拒？）");
        }
        if (audioRecord == null) {
            throw lastError != null ? lastError : new IOException("麦克风打开失败");
        }
        audioRecord.startRecording();
    }

    private void setupEncoder() throws IOException {
        MediaFormat format = MediaFormat.createAudioFormat(MIME, SAMPLE_RATE, CHANNELS);
        format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        format.setInteger(MediaFormat.KEY_BIT_RATE, BITRATE);
        format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, FRAME_SAMPLES * 4);

        encoder = MediaCodec.createEncoderByType(MIME);
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        encoder.start();
    }

    /** 采集 → 编码 → 发送 */
    private void pump() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        long startNanos = System.nanoTime();

        while (running) {
            // --- 读一帧 PCM ---
            short[] pcm = new short[FRAME_SAMPLES * CHANNELS];
            int read = audioRecord.read(pcm, 0, pcm.length);
            if (read <= 0) continue;

            // --- 喂给编码器 ---
            int inputIndex = encoder.dequeueInputBuffer(10_000);
            if (inputIndex >= 0) {
                ByteBuffer inputBuffer = encoder.getInputBuffer(inputIndex);
                if (inputBuffer != null) {
                    inputBuffer.clear();
                    for (int i = 0; i < read; i++) {
                        inputBuffer.putShort(pcm[i]);
                    }
                    encoder.queueInputBuffer(
                        inputIndex, 0, read * 2, System.nanoTime() / 1000, 0);
                }
            }

            // --- 取编码结果 ---
            int outputIndex = encoder.dequeueOutputBuffer(info, 10_000);
            while (outputIndex >= 0) {
                if (info.size > 0) {
                    ByteBuffer encoded = encoder.getOutputBuffer(outputIndex);
                    if (encoded != null) {
                        encoded.position(info.offset);
                        encoded.limit(info.offset + info.size);
                        byte[] payload = new byte[info.size];
                        encoded.get(payload);
                        sendFrame(payload, startNanos);
                    }
                }
                encoder.releaseOutputBuffer(outputIndex, false);
                outputIndex = encoder.dequeueOutputBuffer(info, 0);
            }
        }
    }

    /** 一帧 UDP 包：seq(u16) + ts(u32 微秒) + Opus 数据 */
    private void sendFrame(byte[] payload, long startNanos) {
        try {
            long elapsedMicros = (System.nanoTime() - startNanos) / 1000;
            byte[] header = new byte[6];
            ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN);
            header[0] = (byte) ((sequence >> 8) & 0xFF);
            header[1] = (byte) (sequence & 0xFF);
            header[2] = (byte) ((elapsedMicros >> 24) & 0xFF);
            header[3] = (byte) ((elapsedMicros >> 16) & 0xFF);
            header[4] = (byte) ((elapsedMicros >> 8) & 0xFF);
            header[5] = (byte) (elapsedMicros & 0xFF);

            byte[] packet = new byte[header.length + payload.length];
            System.arraycopy(header, 0, packet, 0, header.length);
            System.arraycopy(payload, 0, packet, header.length, payload.length);

            sequence = (sequence + 1) & 0xFFFF;

            DatagramPacket datagram = new DatagramPacket(packet, packet.length, target, targetPort);
            socket.send(datagram);
        } catch (IOException e) {
            Log.w(TAG, "发送音频失败：" + e.getMessage());
        }
    }

    private void releaseAudio() {
        if (audioRecord != null) {
            try {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
            } catch (IllegalStateException ignored) {
                // 已经停了
            }
            audioRecord.release();
            audioRecord = null;
        }
    }

    private void releaseEncoder() {
        if (encoder != null) {
            try {
                encoder.stop();
                encoder.release();
            } catch (IllegalStateException ignored) {
                // 已经释放了
            }
            encoder = null;
        }
    }
}
