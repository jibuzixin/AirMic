package com.airmic.phone;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.HashMap;
import java.util.Map;

/**
 * 局域网扫描：找出广播 {@code _airmic._tcp} 的电脑。
 *
 * <p>只在用户点「刷新」时扫一次 —— 不持续扫描（费电、费网络，需求说明书 §3.2）。
 */
public class DeviceScanner {

    private static final String TAG = "AirMicScan";
    private static final String SERVICE_TYPE = "_airmic._tcp";

    public interface Listener {
        void onDevice(JSObject device);
    }

    private final Context context;
    private final Listener listener;
    private final Map<String, JSObject> found = new HashMap<>();
    private NsdManager nsdManager;
    private boolean discovering = false;
    private NsdManager.DiscoveryListener discoveryListener;

    public DeviceScanner(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
    }

    public void start() {
        if (discovering) return;
        found.clear();
        discovering = true;

        final NsdManager manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        nsdManager = manager;

        NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
                @Override public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                    Log.w(TAG, "扫描启动失败：" + errorCode);
                    discovering = false;
                }

                @Override public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                    Log.w(TAG, "扫描停止失败：" + errorCode);
                    discovering = false;
                }

                @Override public void onDiscoveryStarted(String serviceType) {
                    Log.i(TAG, "开始扫描 " + serviceType);
                }

                @Override public void onServiceFound(NsdServiceInfo serviceInfo) {
                    resolve(manager, serviceInfo);
                }

                @Override public void onServiceLost(NsdServiceInfo serviceInfo) {
                    found.remove(serviceInfo.getServiceName());
                }

                @Override public void onDiscoveryStopped(String serviceType) {
                    discovering = false;
                }
            };
        discoveryListener = listener;
        manager.discoverServices(
            SERVICE_TYPE,
            NsdManager.PROTOCOL_DNS_SD,
            listener
        );
    }

    public void stop() {
        discovering = false;
        try {
            if (nsdManager != null && discoveryListener != null) {
                nsdManager.stopServiceDiscovery(discoveryListener);
            }
        } catch (Exception e) {
            Log.w(TAG, "停止扫描出错：" + e.getMessage());
        }
        discoveryListener = null;
        nsdManager = null;
    }

    /** 当前已发现的设备 */
    public JSObject snapshot() {
        JSArray devices = new JSArray();
        for (JSObject device : found.values()) {
            devices.put(device);
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        return result;
    }

    /** TXT 记录取字符串 */
    private static String attributeString(Map<String, byte[]> attributes, String key) {
        if (attributes == null) return null;
        byte[] value = attributes.get(key);
        if (value == null) return null;
        return new String(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    @SuppressWarnings("deprecation")
    private void resolve(NsdManager manager, NsdServiceInfo serviceInfo) {
        manager.resolveService(
            serviceInfo,
            new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo info, int errorCode) {
                    Log.w(TAG, "解析失败：" + info.getServiceName() + " (" + errorCode + ")");
                }

                @Override public void onServiceResolved(NsdServiceInfo info) {
                    String address = info.getHost() == null ? null : info.getHost().getHostAddress();
                    if (address == null) return;

                    // Bonjour 的 TXT 记录在 Android 上是 byte[]
                    Map<String, byte[]> attributes = info.getAttributes();
                    String id = attributeString(attributes, "id");
                    if (id == null) id = info.getServiceName();
                    String name = attributeString(attributes, "name");
                    if (name == null) name = info.getServiceName();

                    JSObject device = new JSObject();
                    device.put("id", id);
                    device.put("name", name);
                    device.put("model", "macOS");
                    device.put("signal", 4);
                    // 本地有这个设备的 token 就说明之前配对过 ——
                    // 否则手机上会把已配对设备当成新的，重新发配对请求。
                    device.put("paired", TokenStore.get(context, id) != null);
                    device.put("lastSeen", System.currentTimeMillis());
                    device.put("host", address);
                    device.put("port", info.getPort());

                    found.put(id, device);
                    listener.onDevice(device);
                }
            }
        );
    }
}
