package com.airmic.phone;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 长期配对 token 的本地存储。
 *
 * <p>存 SharedPreferences（应用私有）。卸载应用即失效 —— 重新装上要重新配对。
 */
public final class TokenStore {

    private static final String PREFS = "airmic.pairing";
    private static final String KEY_PREFIX = "token.";

    private TokenStore() {
    }

    public static void set(Context context, String deviceId, String token) {
        prefs(context).edit().putString(KEY_PREFIX + deviceId, token).apply();
    }

    public static String get(Context context, String deviceId) {
        if (deviceId == null) return null;
        return prefs(context).getString(KEY_PREFIX + deviceId, null);
    }

    public static void clear(Context context, String deviceId) {
        prefs(context).edit().remove(KEY_PREFIX + deviceId).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
