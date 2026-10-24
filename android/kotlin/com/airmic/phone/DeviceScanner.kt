package com.airmic.phone

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.util.Log
import com.getcapacitor.JSObject
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 局域网扫描：找出广播 `_airmic._tcp` 的电脑。
 *
 * 只在用户点「刷新」时扫一次 —— 不持续扫描（费电、费网络，需求说明书 §3.2）。
 */
class DeviceScanner(
    private val context: Context,
    private val onFound: (JSObject) -> Unit,
) {
    companion object {
        const val SERVICE_TYPE = "_airmic._tcp"
        private const val TAG = "AirMicScan"
    }

    private var nsdManager: NsdManager? = null
    private val discovering = AtomicBoolean(false)
    private val found = mutableMapOf<String, JSObject>()

    fun start() {
        if (!discovering.compareAndSet(false, true)) return
        found.clear()

        val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        nsdManager = manager

        manager.discoverServices(
            SERVICE_TYPE,
            NsdServiceInfo.PROTOCOL_DNS_SD,
            object : NsdManager.DiscoveryListener {
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.w(TAG, "扫描启动失败：$errorCode")
                    discovering.set(false)
                }

                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.w(TAG, "扫描停止失败：$errorCode")
                    discovering.set(false)
                }

                override fun onDiscoveryStarted(serviceType: String) {
                    Log.i(TAG, "开始扫描 $serviceType")
                }

                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    resolve(manager, serviceInfo)
                }

                override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                    found.remove(serviceInfo.serviceName)
                }

                override fun onDiscoveryStopped(serviceType: String) {
                    discovering.set(false)
                }
            },
        )
    }

    fun stop() {
        discovering.set(false)
        try {
            nsdManager?.stopServiceDiscovery()
        } catch (e: Exception) {
            Log.w(TAG, "停止扫描出错：${e.message}")
        }
        nsdManager = null
    }

    /** 当前已发现的设备 */
    fun snapshot(): List<JSObject> = found.values.toList()

    private fun resolve(manager: NsdManager, serviceInfo: NsdServiceInfo) {
        @Suppress("DEPRECATION")
        manager.resolveService(
            serviceInfo,
            object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    Log.w(TAG, "解析失败：${serviceInfo.serviceName} ($errorCode)")
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    val host = serviceInfo.host
                    val address = host?.hostAddress ?: return
                    val attributes = serviceInfo.attributes

                    val device = JSObject()
                    device.put("id", attributes["id"]?.toString() ?: serviceInfo.serviceName)
                    device.put("name", attributes["name"]?.toString() ?: serviceInfo.serviceName)
                    device.put("model", "macOS")
                    device.put("signal", 4)
                    device.put("paired", false)
                    device.put("lastSeen", System.currentTimeMillis())
                    device.put("host", address)
                    device.put("port", serviceInfo.port)

                    found[device.getString("id")!!] = device
                    onFound(device)
                }
            },
        )
    }
}
