package com.airmic.phone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * 麦克风前台服务。
 *
 * <p>收音必须放到前台服务里 —— 否则 app 一进后台（或者锁屏），
 * 系统会回收进程，声音就断了。
 */
public class AirmicMicService extends Service {

    private static final String TAG = "AirMicService";
    private static final String CHANNEL_ID = "airmic.mic";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START = "com.airmic.phone.START";
    public static final String ACTION_STOP = "com.airmic.phone.STOP";
    public static final String EXTRA_HOST = "host";
    public static final String EXTRA_PORT = "port";
    public static final String EXTRA_MODE = "mode";

    private MicCapture capture;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        capture = new MicCapture();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String host = intent.getStringExtra(EXTRA_HOST);
        int port = intent.getIntExtra(EXTRA_PORT, MicCapture.AUDIO_PORT);
        String mode = intent.getStringExtra(EXTRA_MODE);
        if (mode == null) mode = "continuous";

        // ⚠️ 必须**先** startForeground 再做别的 ——
        // 否则初始化失败时会「5 秒内没进前台」被系统杀掉，表现为点一下就闪退。
        // Android 14+：声明了 foregroundServiceType 就必须带类型参数，
        // 否则 startForeground 会抛 IllegalStateException（表现为一点就闪退）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                buildNotification(mode),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, buildNotification(mode));
        }

        if (host == null) {
            Log.w(TAG, "没有目标地址，停止服务");
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            capture.start(mode, host, port);
        } catch (Exception e) {
            Log.e(TAG, "采集启动失败：" + e.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }
        // 被系统杀掉后不自动重启（用户没在说话就别偷偷录音）
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (capture != null) capture.stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "收音", NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("AirMic 正在把手机麦克风传给电脑");
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String mode) {
        String text = "ptt".equals(mode) ? "正在说话" : "正在收音";
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("AirMic")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build();
    }

    /* -------------------------------------------------------------- *
     * 启停
     * -------------------------------------------------------------- */

    public static void start(Context context, String host, int port, String mode) {
        Intent intent = new Intent(context, AirmicMicService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_HOST, host);
        intent.putExtra(EXTRA_PORT, port);
        intent.putExtra(EXTRA_MODE, mode);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
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
}
