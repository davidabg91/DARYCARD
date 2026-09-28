package com.darycommerce.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.mypos.smartsdk.MyPOSAPI;
import com.mypos.smartsdk.MyPOSUtil;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Печат на свободен текст от вградения принтер на терминала myPOS.
 *
 * Протоколът е този от официалния SDK: списък от PrinterCommand, сериализиран като
 * JSON, се праща с broadcast `com.mypos.action.PRINT`, а резултатът се връща с
 * `com.mypos.broadcast.PRINTING_DONE` (extras `printing_started` и `printer_status`).
 *
 * JSON-ът се сглобява на ръка с имената на полетата от `PrinterCommand`
 * (type, text, doubleWidth, doubleHeight, fontSize, alignment), вместо да вкарваме
 * Gson само за това. Примитивите се изпращат винаги, точно както би ги подал Gson;
 * незададените низове се пропускат.
 *
 * ВАЖНО: това е обикновен печат, НЕ фискален бон.
 */
final class DaryPrinter {

    private static final String TAG = "DaryPrinter";

    /** Колкото и да чакаме, интерфейсът не бива да увисва. */
    private static final long PRINT_TIMEOUT_MS = 25000;

    interface Result {
        /** @param status код от PrinterStatus; 0 = успех. */
        void onDone(boolean started, int status, String message);
    }

    private DaryPrinter() { }

    /**
     * @param lines масив от {type?, text?, align?, doubleWidth?, doubleHeight?, fontSize?}
     *              type: TEXT (по подразбиране), HEADER, FOOTER, LOGO
     *              align: ALIGN_LEFT (по подразбиране), ALIGN_CENTER, ALIGN_RIGHT
     */
    static void print(Context context, JSONArray lines, Result callback) {
        final String json;
        try {
            json = buildCommands(lines);
        } catch (Exception e) {
            callback.onDone(false, -1, "Неправилни данни за печат: " + e.getMessage());
            return;
        }

        final Handler main = new Handler(Looper.getMainLooper());
        final boolean[] answered = { false };
        final BroadcastReceiver[] holder = new BroadcastReceiver[1];

        final Runnable finish = () -> {
            if (holder[0] != null) {
                try { context.unregisterReceiver(holder[0]); } catch (Exception ignored) { }
                holder[0] = null;
            }
        };

        final Runnable timeout = () -> {
            if (answered[0]) return;
            answered[0] = true;
            finish.run();
            callback.onDone(false, -1, "Принтерът не отговори навреме.");
        };

        holder[0] = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (answered[0]) return;
                answered[0] = true;
                main.removeCallbacksAndMessages(null);
                boolean started = intent.getBooleanExtra("printing_started", false);
                int status = intent.getIntExtra("printer_status", -1);
                Log.d(TAG, "PRINTING_DONE started=" + started + " status=" + status);
                finish.run();
                callback.onDone(started, status, describe(started, status));
            }
        };

        IntentFilter filter = new IntentFilter(MyPOSUtil.PRINTING_DONE_BROADCAST);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                // Съобщението идва от приложението на myPOS, тоест отвън.
                context.registerReceiver(holder[0], filter, Context.RECEIVER_EXPORTED);
            } else {
                context.registerReceiver(holder[0], filter);
            }
        } catch (Exception e) {
            callback.onDone(false, -1, "Не може да се слуша за резултата: " + e.getMessage());
            return;
        }

        try {
            Intent intent = new Intent(MyPOSUtil.PRINT_BROADCAST);
            intent.putExtra("commands", json);
            MyPOSAPI.sendExplicitBroadcast(context, intent);
            main.postDelayed(timeout, PRINT_TIMEOUT_MS);
        } catch (Exception e) {
            answered[0] = true;
            finish.run();
            callback.onDone(false, -1, "Печатът не тръгна: " + e.getMessage());
        }
    }

    private static String buildCommands(JSONArray lines) throws Exception {
        JSONArray commands = new JSONArray();
        for (int i = 0; i < lines.length(); i++) {
            JSONObject in = lines.getJSONObject(i);
            JSONObject cmd = new JSONObject();
            cmd.put("type", in.optString("type", "TEXT"));
            if (in.has("text")) cmd.put("text", in.getString("text"));
            cmd.put("doubleWidth", in.optBoolean("doubleWidth", false));
            cmd.put("doubleHeight", in.optBoolean("doubleHeight", false));
            cmd.put("fontSize", in.optInt("fontSize", 0));
            cmd.put("alignment", in.optString("align", "ALIGN_LEFT"));
            commands.put(cmd);
        }
        return commands.toString();
    }

    private static String describe(boolean started, int status) {
        if (!started) return "Печатът не започна (код " + status + ").";
        switch (status) {
            case 0:   return "Отпечатано.";
            case 1:   return "Принтерът е зает.";
            case 2:   return "Няма хартия.";
            case 3:   return "Грешка в данните за печат.";
            case 4:   return "Повреда в принтера.";
            case 8:   return "Принтерът е прегрял.";
            case 9:   return "Ниско напрежение — сложи терминала на зарядното.";
            case 240: return "Печатът не завърши.";
            case 252: return "Липсва шрифт в принтера.";
            case 254: return "Твърде много данни за едно подаване.";
            default:  return "Неуспешен печат (код " + status + ").";
        }
    }
}
