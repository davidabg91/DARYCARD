package com.darycommerce.app;

import android.media.AudioManager;
import android.media.ToneGenerator;
import android.util.Log;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.mypos.smartsdk.UltralightManagement;
import com.mypos.smartsdk.OnBindListener;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "DaryScanner")
public class DaryNfcPlugin extends Plugin {

    private static final String TAG = "DaryScanner";
    private final AtomicBoolean isScanningEnabled = new AtomicBoolean(false);
    private final AtomicBoolean isBound = new AtomicBoolean(false);
    private final AtomicInteger scanCounter = new AtomicInteger(0);
    private Thread scanThread = null;
    private ToneGenerator beepGenerator;

    // Stability Wall
    private String lastId = "";
    private long lastTime = 0;

    @Override
    public void load() {
        super.load();
        try {
            getBridge().getActivity().runOnUiThread(() -> {
                getBridge().getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
            try {
                // Use STREAM_ALARM for maximum volume and TONE_SUP_ERROR for distinct warning
                beepGenerator = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
            } catch (Exception e) {
                Log.e(TAG, "ToneGenerator Error: " + e.getMessage());
            }
            
            Log.d(TAG, "Initiating myPOS SDK binding...");
            UltralightManagement.getInstance().bind(getContext(), new OnBindListener() {
                @Override
                public void onBindComplete() {
                    Log.d(TAG, "myPOS SDK Binding SUCCESS");
                    isBound.set(true);
                    isScanningEnabled.set(true);
                    startScanLoop();
                }
            });
        } catch (Exception e) {
            android.util.Log.e(TAG, "Binding Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startNfcScan(PluginCall call) {
        // Always ensure the loop is running
        startScanLoop();
        call.resolve();
    }

    @PluginMethod
    public void stopNfcScan(PluginCall call) {
        // IMMORTAL PROTOCOL: We ignore stop requests to ensure zero-latency
        Log.d(TAG, "NFC Stop request ignored by Hardware Immortal protocol.");
        call.resolve();
    }

    @PluginMethod
    public void triggerWarningBeep(PluginCall call) {
        Log.d(TAG, "🚨 AGGRESSIVE NATIVE WARNING TRIGGERED");
        try {
            // Wait for the initial detection beep to finish
            Thread.sleep(500);
            
            if (beepGenerator != null) {
                // Triple aggressive error tone
                for (int i = 0; i < 3; i++) {
                    beepGenerator.startTone(ToneGenerator.TONE_SUP_ERROR, 300);
                    Thread.sleep(400);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Warning Beep Error: " + e.getMessage());
        }
        call.resolve();
    }

    private synchronized void startScanLoop() {
        if (scanThread != null && scanThread.isAlive()) return;
        
        isScanningEnabled.set(true);
        
        scanThread = new Thread(() -> {
            Thread.currentThread().setPriority(Thread.MAX_PRIORITY);
            Log.d(TAG, "⚡ ETERNAL HARDWARE LOOP STARTED ⚡");
            
            while (isScanningEnabled.get()) {
                try {
                    if (!isBound.get()) {
                        Log.w(TAG, "Waiting for SDK binding...");
                        Thread.sleep(1000);
                        continue;
                    }

                    UltralightManagement.getInstance().open(1000);
                    
                    // Detection Loop
                    while (isScanningEnabled.get() && isBound.get()) {
                        try {
                            if (UltralightManagement.getInstance().detect(10)) {
                                processCardStable();
                                
                                UltralightManagement.getInstance().close(50);
                                Thread.sleep(50);
                                UltralightManagement.getInstance().open(300);
                            }
                            Thread.sleep(10); 
                        } catch (Exception e) {
                            Log.e(TAG, "Detection Error: " + e.getMessage());
                            break; 
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Hardware Loop Error: " + e.getMessage());
                } finally {
                    try {
                        UltralightManagement.getInstance().close(50);
                    } catch (Exception ignored) {}
                }
                
                // Backoff before retry if loop failed or binding lost
                try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
            }
            Log.d(TAG, "⚡ ETERNAL HARDWARE LOOP STOPPED ⚡");
        }, "DaryNfcEternalThread");
        scanThread.start();
    }

    private void processCardStable() {
        String tagId = null;
        String url = null;
        
        try {
            // STAGE 1: UID Read
            byte[] b0 = null;
            try { b0 = UltralightManagement.getInstance().readBlock((byte) 0, 150); } catch (Exception ignored) {}
            
            if (b0 != null && b0.length >= 8) {
                byte[] uidBytes = new byte[7];
                uidBytes[0] = b0[0]; uidBytes[1] = b0[1]; uidBytes[2] = b0[2]; 
                uidBytes[3] = b0[4]; uidBytes[4] = b0[5]; uidBytes[5] = b0[6]; uidBytes[6] = b0[7];
                tagId = bytesToHex(uidBytes).toLowerCase();
            }

            if (tagId == null) return;

            // STABILITY WALL: Increased to 1500ms (1.5s) as requested for absolute reliability
            long now = System.currentTimeMillis();
            if (tagId.equals(lastId) && (now - lastTime) < 1500) {
                return;
            }
            lastId = tagId;
            lastTime = now;

            // Hardware Feedback
            beepGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 100);

            // STAGE 2: URL Read
            byte[] buffer = new byte[48];
            boolean readError = false;
            for (int i = 0; i < 3; i++) {
                try {
                    byte[] chunk = UltralightManagement.getInstance().readBlock((byte) (4 + (i * 4)), 150);
                    if (chunk != null) {
                        System.arraycopy(chunk, 0, buffer, i * 16, 16);
                    } else {
                        readError = true;
                        break;
                    }
                } catch (Exception e) {
                    readError = true;
                    break;
                }
            }
            if (!readError) url = extractUrl(buffer);

            // STAGE 3: RELIABLE EMISSION
            final String fId = tagId;
            final String fUrl = url != null ? url : "";
            final int fCount = scanCounter.incrementAndGet();
            
            getBridge().getActivity().runOnUiThread(() -> {
                JSObject ret = new JSObject();
                ret.put("tagId", fId);
                ret.put("url", fUrl);
                ret.put("count", fCount);
                notifyListeners("nfcEvent", ret);
            });
        } catch (Exception e) {
            android.util.Log.e(TAG, "Process Error: " + e.getMessage());
        }
    }

    private String extractUrl(byte[] data) {
        try {
            String raw = new String(data, "UTF-8");
            if (raw.contains("darycommerce.com")) {
                int start = raw.indexOf("darycommerce.com");
                int backtrack = start;
                while (backtrack > 0 && raw.charAt(backtrack-1) >= 33 && raw.charAt(backtrack-1) <= 126) {
                    backtrack--;
                }
                int end = start;
                while (end < raw.length() && raw.charAt(end) >= 33 && raw.charAt(end) <= 126) {
                    end++;
                }
                String result = raw.substring(backtrack, end);
                if (!result.startsWith("http")) result = "https://" + result;
                return result;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) { sb.append(String.format("%02X", b)); }
        return sb.toString();
    }
}
