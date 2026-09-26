import { getToken } from 'firebase/messaging';
import { collection, query, where, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { db, getSafeMessaging } from '../firebase';

/**
 * Абонаментите за административни push известия на ТОВА устройство.
 *
 * Всички видове известия делят един документ в `admin_push_tokens` за устройството
 * (ключът е FCM токенът), а всеки вид си има свой булев флаг. Cloud Function-ите
 * питат точно по този флаг, напр. alertUnpaidScan → `unpaidAlerts == true`.
 *
 * Защо е отделено от компонентите: състоянието на бутоните се четеше само от
 * localStorage и затова лъжеше. FCM токенът умира, когато push абонаментът се
 * развали (например след „ядреното" презареждане при нова версия, което
 * разрегистрираше и `firebase-messaging-sw.js`), а функцията изтрива документа,
 * щом FCM отговори `registration-token-not-registered`. Устройството оставаше
 * отписано, а картата продължаваше да показва „Активирано".
 *
 * Сега истината е в базата, а localStorage пази само НАМЕРЕНИЕТО на потребителя,
 * за да може абонаментът да се възстанови сам, ако токенът е бил подменен.
 */
export type AlertFlag = 'unpaidAlerts' | 'adminAlerts' | 'batteryAlerts';

export type AlertState = 'idle' | 'enabled' | 'unsupported';

/**
 * Никое от обажданията към messaging не бива да виси без край. `getToken`
 * регистрира service worker-а, абонира push и говори с FCM — всяка от тези стъпки
 * може да замълчи (блокирана мрежа, service worker, който не се активира), а
 * тогава бутонът оставаше на „Активиране..." завинаги.
 */
const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
    Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(what)), ms)),
    ]);

interface AlertUser {
    id?: string;
    username?: string;
}

const VAPID_KEY = 'BE7-3cZ9dKhdQXrxP7o-QbCvl2XubkfIEkg7w8xsyJFN6OzfQ4YWg4UjuimkaALUBBjXz4Inqzc0bPhdupYOlYo';

/** Ключът, в който помним, че устройството ИСКА този вид известия. */
const wantKey = (flag: AlertFlag) => `push_want_${flag}`;

const wants = (flag: AlertFlag): boolean => {
    try {
        if (localStorage.getItem(wantKey(flag)) === '1') return true;
        // Пренасяне от старите ключове, за да не се отпишат заварените устройства.
        const legacy: Record<AlertFlag, string> = {
            unpaidAlerts: 'unpaid_alerts_token',
            adminAlerts: 'admin_alerts_token',
            batteryAlerts: 'battery_alerts_token',
        };
        return !!localStorage.getItem(legacy[flag]);
    } catch {
        return false;
    }
};

const setWants = (flag: AlertFlag, value: boolean) => {
    try {
        if (value) localStorage.setItem(wantKey(flag), '1');
        else localStorage.removeItem(wantKey(flag));
    } catch { /* частен режим — не е критично */ }
};

/**
 * Токенът на това устройство. Не пита за разрешение: ако то още не е дадено,
 * връща null, за да може състоянието да се чете без да изскача диалог.
 */
const tokenIfAllowed = async (): Promise<string | null> => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    const messaging = await withTimeout(getSafeMessaging(), 8000, 'timeout').catch(() => null);
    if (!messaging) return null;
    // Това пресъздава push абонамента, ако service worker-ът е бил разрегистриран,
    // затова оттук може да излезе НОВ токен — точно както ни трябва за възстановяване.
    return withTimeout(getToken(messaging, { vapidKey: VAPID_KEY }), 15000, 'timeout').catch(() => null);
};

const docsForToken = (token: string) =>
    getDocs(query(collection(db, 'admin_push_tokens'), where('token', '==', token)));

/**
 * Включва известието за това устройство: иска разрешение, взима токен и вдига
 * флага (или създава документа). Хвърля с разбираемо съобщение при отказ.
 */
export async function enableAlert(flag: AlertFlag, user?: AlertUser): Promise<void> {
    if (typeof Notification === 'undefined') throw new Error('Това устройство/браузър не поддържа известия.');
    if (Notification.permission === 'denied') {
        throw new Error('Известията са забранени за сайта. Разреши ги от настройките на телефона (Настройки на сайта → Известия) и опитай отново.');
    }

    const messaging = await withTimeout(getSafeMessaging(), 8000,
        'Модулът за известия не отговори. Провери връзката и опитай отново.');
    if (!messaging) throw new Error('Това устройство/браузър не поддържа известия.');

    const permission = await withTimeout(Notification.requestPermission(), 60000,
        'Не получихме отговор на въпроса за разрешение.');
    if (permission !== 'granted') throw new Error('Известията не са разрешени от браузъра.');

    // Тук се регистрира `firebase-messaging-sw.js` и се прави push абонаментът.
    const token = await withTimeout(getToken(messaging, { vapidKey: VAPID_KEY }), 20000,
        'Заявката за токен не завърши (service worker или мрежа). Опитай отново.');
    if (!token) throw new Error('Неуспешно получаване на токен.');

    await withTimeout(upsert(flag, token, user), 15000, 'Записът в базата не завърши.');
    setWants(flag, true);
}

/** Вдига флага по документа на устройството; създава го, ако е бил изтрит. */
async function upsert(flag: AlertFlag, token: string, user?: AlertUser): Promise<void> {
    const existing = await docsForToken(token);
    if (existing.empty) {
        await addDoc(collection(db, 'admin_push_tokens'), {
            token,
            uid: user?.id || '',
            username: user?.username || '',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            [flag]: true,
            createdAt: new Date().toISOString(),
        });
        return;
    }
    // Всички съвпадащи документа, не само първият: при дублиран токен изгасяването
    // на един оставяше друг активен.
    await Promise.all(existing.docs.map(d => updateDoc(d.ref, { [flag]: true })));
}

/** Изключва известието за това устройство по всички негови документи. */
export async function disableAlert(flag: AlertFlag): Promise<void> {
    setWants(flag, false);
    const token = await tokenIfAllowed();
    if (!token) return;
    const existing = await docsForToken(token);
    await Promise.all(existing.docs.map(d => updateDoc(d.ref, { [flag]: false })));
}

/**
 * Състоянието при отваряне на панела — и тихо възстановяване. Ако устройството е
 * искало известия и разрешението е налице, записът се презаписва с текущия токен:
 * така отписване заради подменен токен се лекува само̀, без потребителят да пипа
 * нищо. Ако потребителят сам е изключил известието, тук не се прави нищо.
 */
export async function syncAlert(flag: AlertFlag, user?: AlertUser): Promise<AlertState> {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (!wants(flag)) return 'idle';
    if (Notification.permission !== 'granted') return 'idle';
    const token = await tokenIfAllowed();
    if (!token) return 'idle';
    const existing = await docsForToken(token);
    const active = existing.docs.some(d => d.data()[flag] === true);
    if (active) return 'enabled';
    // Искаме известия, но записът липсва или флагът е паднал — вдигаме го наново.
    await upsert(flag, token, user);
    return 'enabled';
}
