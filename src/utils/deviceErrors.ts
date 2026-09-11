// Дневник на грешките по устройство.
//
// Всяка различна грешка е ЕДИН документ в `devices/{deviceId}/errors/{hash}`,
// а повторенията само вдигат брояча. Така колекцията е ограничена от броя
// РАЗЛИЧНИ грешки (малък), вместо да расте при всяко счупване — урокът от
// стария `scanHistory` масив.

import { collection, doc, increment, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** Една и съща грешка не се записва по-често от толкова. */
const SAME_ERROR_COOLDOWN_MS = 60 * 1000;

/** Таван за една сесия, за да не изяде квотата въртящ се в кръг срив. */
const MAX_WRITES_PER_SESSION = 50;

const MAX_MESSAGE = 300;

const lastWriteAt = new Map<string, number>();
let writesThisSession = 0;

/** Кратък устойчив ключ за съобщението — служи за id на документа. */
const hashKey = (source: string, message: string): string => {
    const input = `${source}|${message}`;
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
        h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    }
    return `e${h.toString(36)}`;
};

const tidy = (value: unknown): string =>
    String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_MESSAGE);

/**
 * Записва една грешка за устройството. Тихо не прави нищо, ако няма номер на
 * устройство (тоест не сме в приложението) или ако вече е писано скоро.
 */
export const reportDeviceError = (
    deviceId: string,
    source: string,
    rawMessage: unknown,
    appVersion: string
): void => {
    if (!deviceId) return;
    const message = tidy(rawMessage);
    if (!message) return;

    const key = hashKey(source, message);
    const now = Date.now();
    const previous = lastWriteAt.get(key) || 0;
    if (now - previous < SAME_ERROR_COOLDOWN_MS) return;
    if (writesThisSession >= MAX_WRITES_PER_SESSION) return;
    lastWriteAt.set(key, now);
    writesThisSession += 1;

    const ref = doc(collection(db, 'devices', deviceId, 'errors'), key);
    void setDoc(ref, {
        message,
        source,
        appVersion,
        lastAt: new Date(now).toISOString(),
        count: increment(1),
    }, { merge: true }).catch(err => {
        // Няма смисъл да записваме, че записът на грешка се е провалил.
        console.error('Грешката не се записа в дневника:', err);
    });
};

/**
 * Закача се за срива и за необработеното отхвърляне на обещание — двете неща,
 * които иначе изчезват в конзолата на терминал, до който никой не стига.
 * Връща функция за откачане.
 */
export const captureDeviceErrors = (deviceId: string, appVersion: string): (() => void) => {
    if (!deviceId) return () => { };

    const onError = (e: ErrorEvent) => {
        const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
        reportDeviceError(deviceId, 'script', `${e.message}${where}`, appVersion);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
        const reason = e.reason;
        const message = reason instanceof Error
            ? (reason.message || reason.name)
            : (typeof reason === 'object' ? JSON.stringify(reason) : reason);
        reportDeviceError(deviceId, 'promise', message, appVersion);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
    };
};
