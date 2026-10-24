package com.airmic.phone;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件要显式注册
        registerPlugin(AirMicPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
