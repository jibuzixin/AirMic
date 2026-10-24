package com.airmic.phone;

import android.Manifest;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AirMic 原生插件：扫描 / 控制通道 / 麦克风推流。
 *
 * <p>JS 侧接口见 {@code android/src/lib/transport.ts}。
 */
@CapacitorPlugin(
    name = "AirMic",
    permissions = {
        @Permission(alias = "recordAudio", strings = { Manifest.permission.RECORD_AUDIO }),
    }
)
public class AirMicPlugin extends Plugin {

    private static final String TAG = "AirMicPlugin";

    private DeviceScanner scanner;
    private ControlClient control;
    private WifiManager.MulticastLock multicastLock;

    private String deviceId;
    private String deviceName;
    private String currentHost;
    private int currentPort = 47471;

    private final AtomicBoolean connecting = new AtomicBoolean(false);

    @Override
    public void load() {
        Context context = getContext();
        deviceId = "android-" + android.provider.Settings.Secure.getString(
            context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        deviceName = android.os.Build.MODEL;

        scanner = new DeviceScanner(context, device -> {
            JSObject payload = new JSObject();
            payload.put("device", device);
            notifyListeners("scanResult", payload);
        });

        control = new ControlClient(new ControlClient.Listener() {
            @Override public void onMessage(JSONObject message) {
                JSObject payload = new JSObject();
                try {
                    payload.put("payload", message);
                } catch (Exception e) {
                    Log.w(TAG, "消息转发失败：" + e.getMessage());
                    return;
                }
                notifyListeners("message", payload);
            }

            @Override public void onConnected() {
                JSObject payload = new JSObject();
                payload.put("connected", true);
                notifyListeners("connection", payload);
            }

            @Override public void onDisconnected(String error) {
                JSObject payload = new JSObject();
                payload.put("connected", false);
                payload.put("error", error == null ? "连接断开" : error);
                notifyListeners("connection", payload);
            }
        });

    }

    @Override
    protected void handleOnDestroy() {
        if (scanner != null) scanner.stop();
        if (control != null) control.disconnect();
        AirmicMicService.stop(getContext());
        releaseMulticastLock();
        super.handleOnDestroy();
    }

    /* -------------------------------------------------------------- *
     * 扫描
     * -------------------------------------------------------------- */

    @PluginMethod
    public void scan(PluginCall call) {
        acquireMulticastLock();
        scanner.start();

        // 扫一会儿就把当前结果返回（不持续扫描）
        new Thread(() -> {
            try {
                Thread.sleep(3000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            call.resolve(scanner.snapshot());
        }).start();
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        scanner.stop();
        call.resolve();
    }

    /* -------------------------------------------------------------- *
     * 连接
     * -------------------------------------------------------------- */

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        String targetId = call.getString("deviceId");
        String token = call.getString("token");

        if (host == null || host.isEmpty()) {
            call.reject("没有拿到电脑地址，重新扫一次");
            return;
        }
        if (!connecting.compareAndSet(false, true)) {
            call.reject("正在连接中");
            return;
        }

        currentHost = host;
        currentPort = port == null ? 47471 : port;

        new Thread(() -> {
            try {
                control.connect(host, currentPort);

                // hello：带 token 就是已配对设备，直接连上
                JSObject hello = new JSObject();
                hello.put("type", "hello");
                hello.put("protocolVersion", 1);
                hello.put("deviceId", deviceId);
                hello.put("deviceName", deviceName);
                hello.put("model", deviceName);
                String effectiveToken = token != null ? token : TokenStore.get(getContext(), targetId);
                if (effectiveToken != null) hello.put("token", effectiveToken);

                control.send((JSONObject) hello);
                connecting.set(false);
                call.resolve();
            } catch (Exception e) {
                connecting.set(false);
                call.reject("连不上电脑，确认 AirMic 还在运行、手机和电脑在同一个 Wi-Fi 下");
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        AirmicMicService.stop(getContext());
        if (control != null) control.disconnect();
        connecting.set(false);
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null) {
            call.reject("没有内容可发");
            return;
        }
        try {
            control.send(new JSONObject(payload));
            call.resolve();
        } catch (Exception e) {
            call.reject("消息格式不对：" + e.getMessage());
        }
    }

    /* -------------------------------------------------------------- *
     * 麦克风
     * -------------------------------------------------------------- */

    @PluginMethod
    public void startMic(PluginCall call) {
        String mode = call.getString("mode", "continuous");
        if (currentHost == null) {
            call.reject("还没连上电脑");
            return;
        }
        // 采集跑在前台服务里：切后台 / 锁屏都不会断
        AirmicMicService.start(getContext(), currentHost, MicCapture.AUDIO_PORT, mode);
        call.resolve();
    }

    @PluginMethod
    public void stopMic(PluginCall call) {
        AirmicMicService.stop(getContext());
        call.resolve();
    }

    /* -------------------------------------------------------------- *
     * 设备信息
     * -------------------------------------------------------------- */

    /**
     * 设备 id 与设备名。
     *
     * <p>JS 侧发消息时必须带上同一个 deviceId —— 否则配对码配出来的
     * token 存在另一个 id 下面，下次重连就认不出来。
     */
    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("deviceId", deviceId);
        info.put("deviceName", deviceName);
        call.resolve(info);
    }

    /* -------------------------------------------------------------- *
     * 配对 token
     * -------------------------------------------------------------- */

    @PluginMethod
    public void saveToken(PluginCall call) {
        String id = call.getString("deviceId");
        String token = call.getString("token");
        if (id == null || token == null) {
            call.reject("缺少设备 id 或 token");
            return;
        }
        TokenStore.set(getContext(), id, token);
        call.resolve();
    }

    /* -------------------------------------------------------------- *
     * 组播锁（mDNS 收包必须持有）
     * -------------------------------------------------------------- */

    private void acquireMulticastLock() {
        if (multicastLock != null && multicastLock.isHeld()) return;
        WifiManager wifiManager = (WifiManager) getContext()
            .getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) return;
        multicastLock = wifiManager.createMulticastLock("airmic-mdns");
        multicastLock.setReferenceCounted(true);
        multicastLock.acquire();
    }

    private void releaseMulticastLock() {
        if (multicastLock != null && multicastLock.isHeld()) {
            multicastLock.release();
        }
        multicastLock = null;
    }
}
