import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { db, getSafeMessaging } from '../firebase';

/**
 * Подновява абонаментите за известия по линии на ТОВА устройство.
 *
 * FCM токенът умира при всяко разваляне на push абонамента — например когато
 * приложението разрегистрира service worker-и при нова версия (поправено на
 * 26.09.2026) или когато браузърът подмени токена сам. Записът в
 * `push_subscriptions` обаче остава със стария токен, така че известията спират
 * тихо: никой не разбира, докато не се оплаче пътник.
 *
 * Затова при всяко отваряне на сайта проверяваме: ако устройството е искало
 * известия за някоя линия (пази се ключ `fcm_token_<линия>` в localStorage) и
 * разрешението още е дадено, взимаме текущия токен и ако се е сменил —
 * записваме новия и махаме стария.
 *
 * Нищо не се пита на потребителя: без дадено разрешение функцията не прави нищо.
 */
const PREFIX = 'fcm_token_';
const VAPID_KEY = 'BE7-3cZ9dKhdQXrxP7o-QbCvl2XubkfIEkg7w8xsyJFN6OzfQ4YWg4UjuimkaALUBBjXz4Inqzc0bPhdupYOlYo';

const subscribedLines = (): { line: string; token: string }[] => {
    const out: { line: string; token: string }[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(PREFIX)) continue;
            const token = localStorage.getItem(key) || '';
            if (token) out.push({ line: key.slice(PREFIX.length), token });
        }
    } catch { /* забранено хранилище — няма какво да подновяваме */ }
    return out;
};

export async function refreshLineSubscriptions(): Promise<void> {
    const wanted = subscribedLines();
    if (!wanted.length) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const messaging = await getSafeMessaging();
    if (!messaging) return;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (!token) return;

    for (const { line, token: old } of wanted) {
        try {
            if (old !== token) {
                // Новият токен влиза пръв — ако записът пропадне по средата,
                // по-добре два реда, отколкото нито един.
                const existing = await getDocs(query(
                    collection(db, 'push_subscriptions'),
                    where('token', '==', token),
                    where('courseId', '==', line),
                ));
                if (existing.empty) {
                    await addDoc(collection(db, 'push_subscriptions'), {
                        token,
                        courseId: line,
                        createdAt: new Date().toISOString(),
                        platform: navigator.userAgent,
                    });
                }
                const stale = await getDocs(query(
                    collection(db, 'push_subscriptions'),
                    where('token', '==', old),
                    where('courseId', '==', line),
                ));
                await Promise.all(stale.docs.map(d => deleteDoc(d.ref)));
                try { localStorage.setItem(`${PREFIX}${line}`, token); } catch { /* ignore */ }
                console.log(`Абонаментът за „${line}" е подновен с нов токен.`);
            } else {
                // Токенът е същият, но записът може да е бил изтрит — връщаме го.
                const existing = await getDocs(query(
                    collection(db, 'push_subscriptions'),
                    where('token', '==', token),
                    where('courseId', '==', line),
                ));
                if (existing.empty) {
                    await addDoc(collection(db, 'push_subscriptions'), {
                        token,
                        courseId: line,
                        createdAt: new Date().toISOString(),
                        platform: navigator.userAgent,
                    });
                }
            }
        } catch (err) {
            console.error(`Абонаментът за „${line}" не се поднови:`, err);
        }
    }
}
