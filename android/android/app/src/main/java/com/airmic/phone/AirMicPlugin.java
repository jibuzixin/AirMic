package com.airmic.phone;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.view.Window;
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

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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
    /// 电平事件上一次发送时间（限频用）
    private long lastLevelEmitAt = 0;

    @Override
    public void load() {
        // 强制 edge-to-edge：页面画到状态栏下面，颜色由我们自己的背景决定，
        // 不会出现「系统画一条白底」的观感。Android 15 本来就会强制，
        // 这里让 14 及以下保持一致。
        final Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                Window window = activity.getWindow();
                window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
                window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
                WindowCompat.setDecorFitsSystemWindows(window, false);
            });
        }

        // 真实麦克风电平 → 界面上的电平表。
        // ⚠️ 必须限频：采集侧约 47 次/秒，每次都过 JS 桥太费电。
        // 界面上 12 次/秒完全够用（人眼也分不出来）。
        MicCapture.setGlobalLevelListener(level -> {
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - lastLevelEmitAt < 80) return;
            lastLevelEmitAt = now;
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
     * 系统栏
     * -------------------------------------------------------------- */

    /**
     * 系统栏高度（CSS px）。
     *
     * <p>页面是铺满全屏的（画到状态栏下面），所以前端需要自己留出这块内边距 ——
     * 否则要么内容被状态栏挡住，要么露出一条白色的窗口底色。
     */
    @PluginMethod
    public void getInsets(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve(emptyInsets());
            return;
        }
        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            float density = activity.getResources().getDisplayMetrics().density;
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
            if (insets != null) {
                Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                result.put("top", bars.top / density);
                result.put("bottom", bars.bottom / density);
            } else {
                result.put("top", 0);
                result.put("bottom", 0);
            }
            call.resolve(result);
        });
    }

    private JSObject emptyInsets() {
        JSObject result = new JSObject();
        result.put("top", 0);
        result.put("bottom", 0);
        return result;
    }

    /** 状态栏 / 导航栏图标用深色还是浅色（浅色背景用深色图标） */
    @PluginMethod
    public void setSystemBars(PluginCall call) {
        final Activity activity = getActivity();
        final boolean lightBackground = call.getBoolean("light", false);
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(lightBackground);
            controller.setAppearanceLightNavigationBars(lightBackground);
            call.resolve();
        });
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
