package com.chendingya.dividendmonitor;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeDatabaseLifecyclePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
