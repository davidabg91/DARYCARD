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
    // Lift detection: a tap ends when the card leaves the reader, not when a timer expires.
    private volatile boolean cardTakenAway = true;
    private static final int EMPTY_LOOKS_TO_LIFT = 12; // ~20ms per look => a quarter of a second
    // How far into the tag we are willing to read looking for the NDEF url:
    // pages 4..35 = 128 bytes, the same as the office PC reader.
    private static final int URL_READ_BYTES = 128;

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
                    int emptyLooks = 0;
                    while (isScanningEnabled.get() && isBound.get()) {
                        try {
                            if (UltralightManagement.getInstance().detect(10)) {
                                emptyLooks = 0;
                                MainActivity.wakeFromScan();
                                processCardStable();
                                
                                UltralightManagement.getInstance().close(50);
                                Thread.sleep(50);
                                UltralightManagement.getInstance().open(300);
                            } else if (emptyLooks < EMPTY_LOOKS_TO_LIFT) {
                                emptyLooks++;
                                if (emptyLooks >= EMPTY_LOOKS_TO_LIFT) {
                                    cardTakenAway = true;
                                }
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
            // STAGE 1: UID Read (block 0 reads blocks 0, 1, 2, 3)
            byte[] b0 = null;
            try { b0 = UltralightManagement.getInstance().readBlock((byte) 0, 150); } catch (Exception ignored) {}
            
            if (b0 != null && b0.length >= 8) {
                byte[] uidBytes = new byte[7];
                uidBytes[0] = b0[0]; uidBytes[1] = b0[1]; uidBytes[2] = b0[2]; 
                uidBytes[3] = b0[4]; uidBytes[4] = b0[5]; uidBytes[5] = b0[6]; uidBytes[6] = b0[7];
                tagId = bytesToHex(uidBytes).toLowerCase();
            }

            if (tagId == null) return;

            // STABILITY WALL: the same card counts again only after it has been lifted off the
            // reader; the timer is just a floor for a card that blinks out of range without leaving.
            long now = System.currentTimeMillis();
            if (tagId.equals(lastId) && (!cardTakenAway || now - lastTime < 2500)) {
                return;
            }
            lastId = tagId;
            lastTime = now;
            cardTakenAway = false;

            // Parse NTAG chip type from Capability Container (CC) (page 3, byte 2)
            int chipType = 0; // 0 = unknown, 213, 215, 216
            byte configPage = 0;
            if (b0 != null && b0.length >= 16) {
                int sizeByte = b0[14] & 0xFF;
                if (sizeByte == 0x12) {
                    chipType = 213;
                    configPage = (byte) 41;
                } else if (sizeByte == 0x3E) {
                    chipType = 215;
                    configPage = (byte) 131;
                } else if (sizeByte == 0x6D) {
                    chipType = 216;
                    configPage = (byte) 227;
                }
            }

            // STAGE 2.5: (Counter disabled for system stability — using physical UID verification instead)
            int nfcCounter = -1;

            // Hardware Feedback
            beepGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 100);

            // STAGE 2: URL Read.
            // Read in 16-byte chunks and stop as soon as the address ends INSIDE what we
            // already have. The printed cards (9-char code) finish on the third chunk —
            // exactly as many reads as before — while the generated ones (12-char code)
            // need a fourth. The ceiling is page 35, i.e. 128 bytes, the same window the
            // office PC reader uses. Reading only the old 48 bytes silently cut the
            // longer links and produced a chopped-off card id.
            byte[] buffer = new byte[URL_READ_BYTES];
            int filled = 0;
            for (int i = 0; i < URL_READ_BYTES / 16; i++) {
                byte[] chunk = null;
                try {
                    chunk = UltralightManagement.getInstance().readBlock((byte) (4 + (i * 4)), 150);
                } catch (Exception ignored) {}
                if (chunk == null || chunk.length == 0) break;
                int take = Math.min(16, chunk.length);
                System.arraycopy(chunk, 0, buffer, i * 16, take);
                filled = (i * 16) + take;
                if (isUrlComplete(buffer, filled)) break;
            }
            // Only trust a COMPLETE address. A half-read one would yield a wrong card id;
            // leaving it empty makes the app fall back to the chip's physical UID, which
            // resolves through nfc_uids instead.
            if (isUrlComplete(buffer, filled)) url = extractUrl(buffer, filled);

            // STAGE 3: RELIABLE EMISSION
            final String fId = tagId;
            final String fUrl = url != null ? url : "";
            final int fCount = scanCounter.incrementAndGet();
            final int fNfcCounter = nfcCounter;
            
            getBridge().getActivity().runOnUiThread(() -> {
                JSObject ret = new JSObject();
                ret.put("tagId", fId);
                ret.put("url", fUrl);
                ret.put("count", fCount);
                if (fNfcCounter != -1) {
                    ret.put("nfcCounter", fNfcCounter);
                }
                notifyListeners("nfcEvent", ret);
            });
        } catch (Exception e) {
            android.util.Log.e(TAG, "Process Error: " + e.getMessage());
        }
    }

    private static final byte[] HOST = "darycommerce.com".getBytes();

    /** Index of the host name inside the first `length` bytes, or -1. */
    private int indexOfHost(byte[] data, int length) {
        for (int i = 0; i + HOST.length <= length; i++) {
            boolean hit = true;
            for (int j = 0; j < HOST.length; j++) {
                if (data[i + j] != HOST[j]) { hit = false; break; }
            }
            if (hit) return i;
        }
        return -1;
    }

    /**
     * True when the address ends inside what we have read: after the host name there is a
     * non-printable byte (the 0xFE terminator or the trailing zeros). If the printable run
     * reaches the end of the buffer, the address continues into pages we have not read yet.
     */
    private boolean isUrlComplete(byte[] data, int length) {
        int start = indexOfHost(data, length);
        if (start < 0) return false;
        for (int i = start; i < length; i++) {
            int b = data[i] & 0xFF;
            if (b < 33 || b > 126) return true;
        }
        return false;
    }

    private String extractUrl(byte[] data, int length) {
        try {
            String raw = new String(data, 0, length, "UTF-8");
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
