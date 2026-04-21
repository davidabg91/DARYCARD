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

            beepGenerator = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100);
            UltralightManagement.getInstance().bind(getContext(), new OnBindListener() {
                @Override
                public void onBindComplete() {
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

    private void startScanLoop() {
        if (scanThread != null && scanThread.isAlive()) return;
        
        // Ensure flag is always true
        isScanningEnabled.set(true);
        
        scanThread = new Thread(() -> {
            Thread.currentThread().setPriority(Thread.MAX_PRIORITY);
            Log.d(TAG, "⚡ ETERNAL HARDWARE LOOP STARTED ⚡");
            try {
                UltralightManagement.getInstance().open(1000);
                // We keep running as long as the process is alive (while true)
                while (true) { 
                    try {
                        if (UltralightManagement.getInstance().detect(10)) {
                            processCardStable();
                            
                            UltralightManagement.getInstance().close(50);
                            Thread.sleep(50);
                            UltralightManagement.getInstance().open(300);
                        }
                        Thread.sleep(10); 
                    } catch (Exception e) {
                        try {
                            UltralightManagement.getInstance().close(50);
                            Thread.sleep(50);
                            UltralightManagement.getInstance().open(300);
                        } catch (Exception ignored) {}
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Hardware Loop Error: " + e.getMessage());
            }
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
