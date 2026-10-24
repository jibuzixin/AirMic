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

    public ControlClient(Listener listener) {
        this.listener = listener;
    }

    public synchronized void connect(String host, int port) throws IOException {
        disconnect();
        Socket newSocket = new Socket();
        newSocket.connect(new InetSocketAddress(host, port), 5000);
        newSocket.setTcpNoDelay(true);
        socket = newSocket;
        output = newSocket.getOutputStream();
        running = true;

        readerThread = new Thread(this::readLoop, "airmic-control");
        readerThread.setDaemon(true);
        readerThread.start();

        Log.i(TAG, "已连接 " + host + ":" + port);
        listener.onConnected();
    }

    public synchronized void disconnect() {
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
        return socket != null && socket.isConnected() && running;
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
            listener.onDisconnected(e.getMessage());
        }
    }

    public void send(JSObject message) {
        // JSObject 本身就是 JSONObject 的子类
        send((JSONObject) message);
    }

    private void readLoop() {
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while (running && (line = reader.readLine()) != null) {
                if (line.isEmpty()) continue;
                try {
                    listener.onMessage(new JSONObject(line));
                } catch (JSONException e) {
                    Log.w(TAG, "消息解析失败：" + e.getMessage());
                }
            }
        } catch (IOException e) {
            if (running) {
                Log.w(TAG, "连接断开：" + e.getMessage());
                listener.onDisconnected(e.getMessage());
            }
        } finally {
            running = false;
        }
    }
}
