package com.com.darycommerce.app;

import android.util.Log;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.mypos.smartsdk.UltralightManagement;
import com.mypos.smartsdk.OnBindListener;

import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "DaryScanner")
public class DaryNfcPlugin extends Plugin {

    private static final String TAG = "DaryScanner";
    private final AtomicBoolean isScanningEnabled = new AtomicBoolean(false);
    private Thread scanThread = null;

    @Override
    public void load() {
        super.load();
        try {
            UltralightManagement.getInstance().bind(getContext(), new OnBindListener() {
                @Override
                public void onBindComplete() {
                    isScanningEnabled.set(true);
                    startScanLoop();
                    getBridge().getActivity().runOnUiThread(() -> {
                        Toast.makeText(getContext(), "DARY Scanner Active \uD83F\uDDF2", Toast.LENGTH_SHORT).show();
                    });
                }
            });
        } catch (Exception e) {
            android.util.Log.e(TAG, "Binding Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startNfcScan(PluginCall call) {
        isScanningEnabled.set(true);
        startScanLoop();
        call.resolve();
    }

    @PluginMethod
    public void stopNfcScan(PluginCall call) {
        isScanningEnabled.set(false);
        call.resolve();
    }

    private void startScanLoop() {
        if (scanThread != null && scanThread.isAlive()) return;
        scanThread = new Thread(() -> {
            try {
                // Open hardware ONCE and keep it open
                UltralightManagement.getInstance().open(1000);
                
                while (isScanningEnabled.get()) {
                    try {
                        // RAW Polling: Detect immediately without any cooldown logic
                        if (UltralightManagement.getInstance().detect(10)) {
                            processCardRaw();
                        }
                        // Minimal sleep to prevent device from overheating
                        Thread.sleep(5); 
                    } catch (Exception e) {
                        try {
                            UltralightManagement.getInstance().close(100);
                            Thread.sleep(50);
                            UltralightManagement.getInstance().open(300);
                        } catch (Exception ignored) {}
                    }
                }
            } catch (Exception e) {
                android.util.Log.e(TAG, "Hardware loop failed: " + e.getMessage());
            } finally {
                try { UltralightManagement.getInstance().close(500); } catch (Exception ignored) {}
            }
        });
        scanThread.start();
    }

    private void processCardRaw() {
        try {
            // Read ONLY necessary blocks with very short timeouts
            byte[] block0 = UltralightManagement.getInstance().readBlock((byte) 0, 150); 
            if (block0 == null || block0.length < 8) return;
            
            byte[] uidBytes = new byte[7];
            uidBytes[0] = block0[0]; uidBytes[1] = block0[1]; uidBytes[2] = block0[2]; 
            uidBytes[3] = block0[4]; uidBytes[4] = block0[5]; uidBytes[5] = block0[6]; uidBytes[6] = block0[7];
            String currentTagId = bytesToHex(uidBytes).toLowerCase();
            
            // Read 32 bytes for the URL (blocks 4 and 8)
            byte[] bigBuffer = new byte[32]; 
            byte[] b4 = UltralightManagement.getInstance().readBlock((byte) 4, 150);
            if (b4 != null) System.arraycopy(b4, 0, bigBuffer, 0, 16);
            
            byte[] b8 = UltralightManagement.getInstance().readBlock((byte) 8, 150);
            if (b8 != null) System.arraycopy(b8, 0, bigBuffer, 16, 16);
            
            String parsedUrl = extractUrlRaw(bigBuffer);

            // We notify EVERY time we have a valid read, no cooldowns
            JSObject ret = new JSObject();
            ret.put("tagId", currentTagId);
            ret.put("url", parsedUrl != null ? parsedUrl : "");
            notifyListeners("nfcEvent", ret);

        } catch (Exception e) {
            android.util.Log.e(TAG, "Read Error: " + e.getMessage());
        }
    }

    private String extractUrlRaw(byte[] data) {
        try {
            String raw = new String(data, "UTF-8");
            if (raw.contains("darycommerce.com")) {
                int start = raw.indexOf("http");
                if (start >= 0) {
                    int end = start;
                    while (end < raw.length() && raw.charAt(end) >= 33 && raw.charAt(end) <= 126) {
                        end++;
                    }
                    return raw.substring(start, end);
                }
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
