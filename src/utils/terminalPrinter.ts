import { Capacitor } from '@capacitor/core';
import MyPosSmartSdk from '../services/MyPosSmartSdk';

/**
 * Печат от вградения принтер на терминала myPOS.
 *
 * ВАЖНО: това е обикновен документ, НЕ фискален бон. Терминалът печата като
 * принтер, не като фискално устройство. Става за служебен талон, дубликат или
 * вътрешен контрол — не замества касов апарат.
 *
 * Хартията е 58 мм: **32 знака на ред** (`RECEIPT_SMART_MAX_CHARS_PER_LINE` в SDK-а).
 * Текст над това се пренася и разваля подравняването, затова има помощници.
 */
export const LINE_WIDTH = 32;

export type PrintLine = {
    /** TEXT (по подразбиране), HEADER (данни на търговеца + дата/час), FOOTER, LOGO */
    type?: 'TEXT' | 'HEADER' | 'FOOTER' | 'LOGO';
    text?: string;
    align?: 'ALIGN_LEFT' | 'ALIGN_CENTER' | 'ALIGN_RIGHT';
    doubleWidth?: boolean;
    doubleHeight?: boolean;
};

export interface PrintResult {
    ok: boolean;
    started: boolean;
    status: number;
    message: string;
}

/** Печата ли това устройство изобщо — само терминалът с APK-то може. */
export const canPrint = (): boolean => Capacitor.isNativePlatform();

/** Ред с ляво и дясно подравнена част, запълнен с точки: „Цена ........ 5.00" */
export const row = (left: string, right: string, width = LINE_WIDTH): string => {
    const l = left.slice(0, width);
    const r = right.slice(0, Math.max(0, width - l.length));
    const gap = Math.max(1, width - l.length - r.length);
    return `${l}${' '.repeat(gap)}${r}`;
};

/** Разделителна линия. */
export const rule = (ch = '-', width = LINE_WIDTH): string => ch.repeat(width);

export async function printLines(lines: PrintLine[]): Promise<PrintResult> {
    if (!canPrint()) {
        return { ok: false, started: false, status: -1, message: 'Печат има само от терминал myPOS.' };
    }
    const sdk = MyPosSmartSdk as unknown as {
        printLines?: (opts: { lines: PrintLine[] }) => Promise<PrintResult>;
    };
    if (!sdk.printLines) {
        return { ok: false, started: false, status: -1, message: 'Това APK още няма печат — трябва обновено приложение на терминала.' };
    }
    try {
        return await sdk.printLines({ lines });
    } catch (err: unknown) {
        return {
            ok: false, started: false, status: -1,
            message: err instanceof Error ? err.message : 'Неуспешен печат.',
        };
    }
}

/**
 * Пробно листче: показва, че печатът работи, каква е ширината и че документът
 * не е фискален. Съзнателно няма суми — това е проверка на хардуера.
 */
export async function printTestSlip(who: string, deviceName?: string): Promise<PrintResult> {
    const now = new Date();
    const stamp = now.toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' });
    return printLines([
        { type: 'TEXT', text: 'ДАРИ КОМЕРС\n', align: 'ALIGN_CENTER', doubleHeight: true },
        { type: 'TEXT', text: 'ПРОБЕН ПЕЧАТ\n', align: 'ALIGN_CENTER' },
        { type: 'TEXT', text: `${rule()}\n` },
        { type: 'TEXT', text: `${row('Дата и час', stamp)}\n` },
        { type: 'TEXT', text: `${row('Терминал', deviceName || '—')}\n` },
        { type: 'TEXT', text: `${row('Оператор', who || '—')}\n` },
        { type: 'TEXT', text: `${rule()}\n` },
        { type: 'TEXT', text: 'Проверка на ширината:\n' },
        { type: 'TEXT', text: '12345678901234567890123456789012\n' },
        { type: 'TEXT', text: `${rule('=')}\n` },
        { type: 'TEXT', text: 'ДОКУМЕНТЪТ НЕ Е ФИСКАЛЕН\n', align: 'ALIGN_CENTER' },
        { type: 'TEXT', text: 'Служебен, за проверка на принтера\n\n\n', align: 'ALIGN_CENTER' },
    ]);
}
