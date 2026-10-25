package com.airmic.phone;

import android.Manifest;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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
        // Android 13+ 扫局域网（mDNS）需要这个权限；老版本上没有这个权限，会被忽略
        @Permission(alias = "nearbyWifi", strings = { Manifest.permission.NEARBY_WIFI_DEVICES }),
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
        // 真实麦克风电平 → 界面上的电平表（原型里那是随机数假数据）
        MicCapture.setGlobalLevelListener(level -> {
            JSObject payload = new JSObject();
            payload.put("level", level);
            notifyListeners("level", payload);
        });

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
        // Android 13+：不申请「附近的设备」权限，mDNS 扫描会直接失败（扫不到电脑）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("nearbyWifi") != PermissionState.GRANTED) {
            requestPermissionForAlias("nearbyWifi", call, "afterNearbyPermission");
            return;
        }
        doScan(call);
    }

    @PermissionCallback
    private void afterNearbyPermission(PluginCall call) {
        doScan(call);
    }

    private void doScan(PluginCall call) {
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
                // ⚠️ token 必须存在**手机自己**的 deviceId 下 ——
                // 之前错存成「对方电脑的 id」，下次重连取不到 → 每次都要重新配对
                String effectiveToken = token != null ? token : TokenStore.get(getContext(), deviceId);
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
        // 没有麦克风权限就直接说清楚，别等下崩在服务里
        if (!hasRecordAudioPermission()) {
            call.reject("还没有麦克风权限，请在系统设置里给 AirMic 开「麦克风」权限");
            return;
        }
        // 采集跑在前台服务里：切后台 / 锁屏都不会断
        AirmicMicService.start(getContext(), currentHost, MicCapture.AUDIO_PORT, mode);
        call.resolve();
    }

    private boolean hasRecordAudioPermission() {
        // 用插件自己的权限别名查（别名在 @Permission 上声明）
        return getPermissionState("recordAudio") == PermissionState.GRANTED;
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
        String token = call.getString("token");
        if (token == null) {
            call.reject("缺少 token");
            return;
        }
        // 统一存在手机自己的 deviceId 下
        TokenStore.set(getContext(), deviceId, token);
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
