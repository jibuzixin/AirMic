package com.airmic.phone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * AirMic 前台服务。
 *
 * <p>有两种模式：
 * <ul>
 *   <li><b>麦克风</b>：采集并推流，类型 microphone。</li>
 *   <li><b>连接</b>：不采集，只把进程留在前台，让控制通道的 TCP 连接在熄屏 /
 *       后台时不被系统冻结，类型 connectedDevice。通知栏只有一条低优先级提示。</li>
 * </ul>
 *
 * <p>两种模式共用同一个 Service 和同一条通知，切换时不会出现两条通知。
 */
public class AirmicMicService extends Service {

    private static final String TAG = "AirMicService";
    private static final String CHANNEL_MIC = "airmic.mic";
    private static final String CHANNEL_LINK = "airmic.link";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START = "com.airmic.phone.START";
    public static final String ACTION_LINK = "com.airmic.phone.LINK";
    public static final String ACTION_STOP = "com.airmic.phone.STOP";
    public static final String EXTRA_HOST = "host";
    public static final String EXTRA_PORT = "port";
    public static final String EXTRA_MODE = "mode";

    private static final String MODE_LINK = "link";

    private MicCapture capture;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        boolean linkMode = ACTION_LINK.equals(intent.getAction());
        String mode = linkMode ? MODE_LINK : intent.getStringExtra(EXTRA_MODE);
        if (mode == null) mode = "continuous";

        // ⚠️ 必须**先** startForeground 再做别的 ——
        // 否则初始化失败时会「5 秒内没进前台」被系统杀掉，表现为点一下就闪退。
        // Android 14+：声明了 foregroundServiceType 就必须带类型参数，
        // 否则 startForeground 会抛 IllegalStateException（表现为一点就闪退）。
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    buildNotification(mode),
                    linkMode
                        ? ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                        : ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else {
                startForeground(NOTIFICATION_ID, buildNotification(mode));
            }
        } catch (Exception e) {
            Log.e(TAG, "进入前台服务失败：" + e.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }

        if (linkMode) {
            // 从收音切到「只保持连接」：停掉采集，但服务继续在前台
            stopCapture();
            return START_NOT_STICKY;
        }

        String host = intent.getStringExtra(EXTRA_HOST);
        int port = intent.getIntExtra(EXTRA_PORT, MicCapture.AUDIO_PORT);
        if (host == null) {
            Log.w(TAG, "没有目标地址，停止服务");
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            if (capture == null) capture = new MicCapture();
            capture.start(mode, host, port);
        } catch (Exception e) {
            Log.e(TAG, "采集启动失败：" + e.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }
        // 被系统杀掉后不自动重启（用户没在说话就别偷偷录音）
        return START_NOT_STICKY;
    }

    private void stopCapture() {
        if (capture != null) {
            capture.stop();
            capture = null;
        }
    }

    @Override
    public void onDestroy() {
        stopCapture();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel mic = new NotificationChannel(
            CHANNEL_MIC, "收音", NotificationManager.IMPORTANCE_LOW
        );
        mic.setDescription("AirMic 正在把手机麦克风传给电脑");
        mic.setShowBadge(false);
        manager.createNotificationChannel(mic);

        NotificationChannel link = new NotificationChannel(
            CHANNEL_LINK, "连接", NotificationManager.IMPORTANCE_LOW
        );
        link.setDescription("AirMic 与电脑保持连接（不收音）");
        link.setShowBadge(false);
        link.setSound(null, null);
        link.enableVibration(false);
        manager.createNotificationChannel(link);
    }

    private Notification buildNotification(String mode) {
        boolean link = MODE_LINK.equals(mode);
        String text = link
            ? "已连接 · 保持连接"
            : ("ptt".equals(mode) ? "正在说话" : "正在收音");

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, link ? CHANNEL_LINK : CHANNEL_MIC);
        } else {
            builder = new Notification.Builder(this);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return builder
            .setContentTitle("AirMic")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(pending)
            .build();
    }

    /* -------------------------------------------------------------- *
     * 启停
     * -------------------------------------------------------------- */

    /** 收音模式 */
    public static void start(Context context, String host, int port, String mode) {
        Intent intent = new Intent(context, AirmicMicService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_HOST, host);
        intent.putExtra(EXTRA_PORT, port);
        intent.putExtra(EXTRA_MODE, mode);
        startCompat(context, intent);
    }

    /** 只保持连接，不收音 */
    public static void startLink(Context context) {
        Intent intent = new Intent(context, AirmicMicService.class);
        intent.setAction(ACTION_LINK);
        startCompat(context, intent);
    }

    public static void stop(Context context) {
        try {
            // 直接停服务，不走 onStartCommand ——
            // 后台状态下 startService 会抛 IllegalStateException（Android 8+）
            context.stopService(new Intent(context, AirmicMicService.class));
        } catch (Exception e) {
            Log.w(TAG, "停止服务失败：" + e.getMessage());
        }
    }

    private static void startCompat(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }
}
