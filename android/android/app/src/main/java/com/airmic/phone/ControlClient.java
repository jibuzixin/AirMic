package com.airmic.phone;

import android.util.Log;

import com.getcapacitor.JSObject;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * 控制通道：TCP + JSON Lines（每行一个 JSON 对象）。
 *
 * <p>协议见 {@code shared/protocol.md}。
 */
public class ControlClient {

    private static final String TAG = "AirMicControl";

    public interface Listener {
        void onMessage(JSONObject message);
        void onConnected();
        void onDisconnected(String error);
    }

    private final Listener listener;
    private Socket socket;
    private OutputStream output;
    private Thread readerThread;
    private volatile boolean running = false;
    /// 每次连接 / 断开都 +1。旧连接的读线程只能影响自己那一代，
    /// 不能在重连后把新连接的 running 置成 false。
    private volatile int generation = 0;

    public ControlClient(Listener listener) {
        this.listener = listener;
    }

    public synchronized void connect(String host, int port) throws IOException {
        disconnect();
        Socket newSocket = new Socket();
        newSocket.connect(new InetSocketAddress(host, port), 5000);
        newSocket.setTcpNoDelay(true);
        // 熄屏 / 后台时让系统继续探测这条连接（服务端也会定时 ping）
        newSocket.setKeepAlive(true);
        socket = newSocket;
        output = newSocket.getOutputStream();
        running = true;
        generation += 1;
        final int myGeneration = generation;

        readerThread = new Thread(
            () -> readLoop(myGeneration, newSocket),
            "airmic-control"
        );
        readerThread.setDaemon(true);
        readerThread.start();

        Log.i(TAG, "已连接 " + host + ":" + port);
        listener.onConnected();
    }

    public synchronized void disconnect() {
        generation += 1;
        running = false;
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // 关闭失败没什么可补救的
        }
        socket = null;
        output = null;
    }

    public boolean isConnected() {
        // isConnected() 只表示「曾经连上过」，对端断开后仍是 true。
        // 用 isClosed() + running 判断本地这条连接是否还能用。
        return socket != null && !socket.isClosed() && running;
    }

    /** 发一条消息（自动补换行） */
    public synchronized void send(JSONObject message) {
        if (output == null) return;
        try {
            output.write(message.toString().getBytes(StandardCharsets.UTF_8));
            output.write('\n');
            output.flush();
        } catch (IOException e) {
            Log.w(TAG, "发送失败：" + e.getMessage());
            // 发送失败说明这条连接已经不可用了：关掉并通知一次，
            // 避免留下一个「看起来还连着」的 socket。
            generation += 1;
            running = false;
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {
                // 已经在失败路径上，关闭失败不追加处理
            }
            socket = null;
            output = null;
            listener.onDisconnected(e.getMessage());
        }
    }

    public void send(JSObject message) {
        // JSObject 本身就是 JSONObject 的子类
        send((JSONObject) message);
    }

    private void readLoop(int myGeneration, Socket mySocket) {
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(mySocket.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while (running && generation == myGeneration
                && (line = reader.readLine()) != null) {
                if (generation != myGeneration) break;
                if (line.isEmpty()) continue;
                try {
                    JSONObject message = new JSONObject(line);
                    // 电脑端的 ping 直接在这里回 pong：
                    // WebView 在后台可能被挂起，交给 JS 回会导致心跳断掉。
                    if ("ping".equals(message.optString("type"))) {
                        JSONObject pong = new JSONObject();
                        pong.put("type", "pong");
                        if (message.has("t")) pong.put("t", message.optLong("t"));
                        send(pong);
                        // send 失败会关闭并让这一代失效，别再往下分发
                        if (generation != myGeneration) break;
                    }
                    listener.onMessage(message);
                } catch (JSONException e) {
                    Log.w(TAG, "消息解析失败：" + e.getMessage());
                }
            }
        } catch (IOException e) {
            if (running && generation == myGeneration) {
                Log.w(TAG, "连接断开：" + e.getMessage());
                listener.onDisconnected(e.getMessage());
            }
        } finally {
            // 只有当前这一代线程才有资格改 running
            if (generation == myGeneration) running = false;
        }
    }
}
