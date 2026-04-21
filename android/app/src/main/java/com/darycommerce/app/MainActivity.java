package com.darycommerce.app;

import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import com.mypos.smartsdk.MyPOSAPI;
import com.mypos.smartsdk.OnPOSInfoListener;
import com.mypos.smartsdk.data.POSInfo;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "DaryScanner";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.e(TAG, "--- MAIN ACTIVITY STARTING ---");
        
        try {
            Log.e(TAG, "AGGRESSIVE REGISTRATION: Registering DaryScanner BEFORE super.onCreate...");
            // Registrating BEFORE super.onCreate ensures it is available when the Bridge initializes
            registerPlugin(DaryNfcPlugin.class);
            Log.e(TAG, "AGGRESSIVE REGISTRATION: Done.");
        } catch (Exception e) {
            Log.e(TAG, "AGGRESSIVE REGISTRATION: Error " + e.getMessage());
        }

        // super.onCreate initializes the Capacitor Bridge
        super.onCreate(savedInstanceState);

        // --- myPOS SMART SDK REGISTRATION (Unlocks Hardware) ---
        try {
            Log.e(TAG, "Hardware Unlock: Initiating POS Info Registration...");
            MyPOSAPI.registerPOSInfo(this, new OnPOSInfoListener() {
                @Override
                public void onReceive(POSInfo info) {
                    Log.e(TAG, "Hardware Unlock: SUCCESS!");
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Terminal Access Granted \u2705", Toast.LENGTH_SHORT).show());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Hardware Unlock: Error " + e.getMessage());
        }

        Log.e(TAG, "--- MAIN ACTIVITY SETUP COMPLETE ---");
    }
}
