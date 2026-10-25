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

    /** 电平回调（真实麦克风电平，0–1） */
    public interface LevelListener {
        void onLevel(float level);
    }

    /**
     * 全局电平监听。
     *
     * <p>采集跑在前台服务里，插件拿不到实例，所以用静态监听者把电平转出去。
     */
    private static volatile LevelListener globalListener;

    public static void setGlobalLevelListener(LevelListener listener) {
        globalListener = listener;
    }

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

    private volatile Thread worker;
    private volatile boolean running = false;
    private volatile String mode = "idle";

    /**
     * 原生资源（AudioRecord / MediaCodec / Socket）。
     *
     * <p>⚠️ 生命周期全部走 {@link #lifecycle} 锁：**先让工作线程退出，再释放**。
     * 之前是在调用线程上直接 release，而工作线程可能还在读 AudioRecord ——
     * 快速反复点按麦克风时两边同时释放原生资源，直接把进程搞崩。
     */
    private final Object lifecycle = new Object();
    private volatile AudioRecord audioRecord;
    private volatile MediaCodec encoder;
    private volatile DatagramSocket socket;
    private InetAddress target;
    private int targetPort;

    private int sequence = 0;

    /** 开始采集。mode: continuous（常开）/ ptt（瞬时说话） */
    public void start(String mode, String host, int port) throws IOException {
        synchronized (lifecycle) {
            stopLocked();
            this.mode = mode;
            this.target = InetAddress.getByName(host);
            this.targetPort = port;
            this.running = true;

            Thread thread = new Thread(this::loop, "airmic-mic");
            thread.setDaemon(true);
            worker = thread;
            thread.start();
        }
    }

    /** 停止采集（等线程退出后再释放资源） */
    public void stop() {
        synchronized (lifecycle) {
            stopLocked();
        }
    }

    private void stopLocked() {
        running = false;
        mode = "idle";

        // 先让阻塞中的 read() 返回
        AudioRecord record = audioRecord;
        if (record != null) {
            try {
                if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    record.stop();
                }
            } catch (Exception ignored) {
                // 已经停了
            }
        }

        Thread thread = worker;
        if (thread != null && thread != Thread.currentThread()) {
            try {
                thread.join(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (thread.isAlive()) {
                // 线程还没退出来 —— **不能**在这里拆原生对象，
                // 否则它还在 read/encode，直接 use-after-release 崩进程。
                // 让它自己在 finally 里释放。
                Log.w(TAG, "采集线程未在超时内退出，交给线程自己释放");
                return;
            }
        }
        worker = null;

        // 线程正常退出时自己会释放；这里兜底（release 是幂等的）
        releaseAll();
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
            running = false;
            return;
        }

        try {
            setupAudioRecord();
            setupEncoder();
            pump();
        } catch (Exception e) {
            Log.e(TAG, "采集失败：" + e.getMessage());
        } finally {
            running = false;
            releaseAll();
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
        AudioRecord record = audioRecord;
        MediaCodec codec = encoder;
        if (record == null || codec == null) return;

        while (running) {
            // --- 读一帧 PCM ---
            short[] pcm = new short[FRAME_SAMPLES * CHANNELS];
            int read;
            try {
                read = record.read(pcm, 0, pcm.length);
            } catch (Exception e) {
                Log.w(TAG, "读取失败：" + e.getMessage());
                break;
            }
            if (read <= 0) continue;

            // --- 真实电平（RMS），给界面上的电平表用 ---
            notifyLevel(pcm, read);

            // --- 喂给编码器 ---
            int inputIndex;
            try {
                inputIndex = codec.dequeueInputBuffer(10_000);
            } catch (Exception e) {
                Log.w(TAG, "编码器已释放：" + e.getMessage());
                break;
            }
            if (inputIndex >= 0) {
                ByteBuffer inputBuffer = codec.getInputBuffer(inputIndex);
                if (inputBuffer != null) {
                    inputBuffer.clear();
                    for (int i = 0; i < read; i++) {
                        inputBuffer.putShort(pcm[i]);
                    }
                    codec.queueInputBuffer(
                        inputIndex, 0, read * 2, System.nanoTime() / 1000, 0);
                }
            }

            // --- 取编码结果 ---
            int outputIndex;
            try {
                outputIndex = codec.dequeueOutputBuffer(info, 10_000);
            } catch (Exception e) {
                Log.w(TAG, "编码器已释放：" + e.getMessage());
                break;
            }
            while (outputIndex >= 0) {
                if (info.size > 0) {
                    ByteBuffer encoded = codec.getOutputBuffer(outputIndex);
                    if (encoded != null) {
                        encoded.position(info.offset);
                        encoded.limit(info.offset + info.size);
                        byte[] payload = new byte[info.size];
                        encoded.get(payload);
                        sendFrame(payload, startNanos);
                    }
                }
                codec.releaseOutputBuffer(outputIndex, false);
                outputIndex = codec.dequeueOutputBuffer(info, 0);
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

    /** 算这一帧的 RMS 电平并抛给监听者 */
    private void notifyLevel(short[] pcm, int count) {
        LevelListener listener = globalListener;
        if (listener == null || count <= 0) return;
        double sum = 0;
        for (int i = 0; i < count; i++) {
            double value = pcm[i] / 32768.0;
            sum += value * value;
        }
        double rms = Math.sqrt(sum / count);
        // 放大一点，肉眼容易看见（说话时大概到 0.3–0.8）
        float level = (float) Math.min(1.0, rms * 4.0);
        listener.onLevel(level);
    }

    /** 幂等释放（可能被工作线程和 stop() 各调用一次） */
    private synchronized void releaseAll() {
        AudioRecord record = audioRecord;
        audioRecord = null;
        if (record != null) {
            try {
                if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    record.stop();
                }
            } catch (Exception ignored) {
                // 已经停了
            }
            try {
                record.release();
            } catch (Exception ignored) {
                // 已经释放
            }
        }

        MediaCodec codec = encoder;
        encoder = null;
        if (codec != null) {
            try {
                codec.stop();
            } catch (Exception ignored) {
                // 已经停了
            }
            try {
                codec.release();
            } catch (Exception ignored) {
                // 已经释放
            }
        }

        DatagramSocket datagram = socket;
        socket = null;
        if (datagram != null) {
            datagram.close();
        }
    }

}
