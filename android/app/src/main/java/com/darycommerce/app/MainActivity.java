package com.darycommerce.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import com.mypos.smartsdk.MyPOSAPI;
import com.mypos.smartsdk.OnPOSInfoListener;
import com.mypos.smartsdk.data.POSInfo;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "DaryScanner";

    // --- Idle screen dimming ---------------------------------------------------
    // After DIM_DELAY_MS of no touch / no card, drop the backlight to DIM_LEVEL so
    // the screen looks "asleep". Any touch OR a scanned card restores full
    // brightness. The screen never actually turns off, so NFC scanning keeps
    // running the whole time. TEST value: 10s — raise DIM_DELAY_MS later.
    private static MainActivity instance;
    private static final long DIM_DELAY_MS = 10_000L;   // dim after 10 seconds
    private static final float DIM_LEVEL = 0.02f;        // near-black backlight
    private static final float FULL_LEVEL = 1.0f;        // full brightness on wake
    private final Handler dimHandler = new Handler(Looper.getMainLooper());

    private final Runnable dimRunnable = () -> setBrightness(DIM_LEVEL);

    private void setBrightness(float level) {
        try {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.screenBrightness = level;
            getWindow().setAttributes(lp);
        } catch (Exception e) {
            Log.e(TAG, "Brightness error: " + e.getMessage());
        }
    }

    /** Restore full brightness and restart the idle-dim countdown. Safe from any thread. */
    public void wakeScreen() {
        runOnUiThread(() -> {
            dimHandler.removeCallbacks(dimRunnable);
            setBrightness(FULL_LEVEL);
            dimHandler.postDelayed(dimRunnable, DIM_DELAY_MS);
        });
    }

    /** Called by the NFC plugin whenever a card is detected. */
    public static void wakeFromScan() {
        if (instance != null) instance.wakeScreen();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        wakeScreen();
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public void onResume() {
        super.onResume();
        wakeScreen();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        instance = this;
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
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Terminal Access Granted ✅", Toast.LENGTH_SHORT).show());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Hardware Unlock: Error " + e.getMessage());
        }

        // --- WebView Configuration (Enable Voice/Audio Autoplay) ---
        this.bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);

        // Start the idle-dim countdown.
        wakeScreen();

        Log.e(TAG, "--- MAIN ACTIVITY SETUP COMPLETE ---");
    }
}
