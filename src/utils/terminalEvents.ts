import { Capacitor } from '@capacitor/core';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { scanContext } from './scanContext';
import { sofiaDay } from './vehiclePosition';

/**
 * Екраните на терминала, които не са пътуване и затова не влизат в
 * `clients/{id}/scans`: картата не се прочете, непозната карта, няма връзка,
 * вече сканирана, дублирана. Досега от тях не оставаше нищо — дете казва
 * „излезе невалидна“, а в системата няма и следа. Сега всеки такъв екран е
 * един документ в `terminal_events`, с кой терминал, кога, какво е прочетено и
 * къде е бил автобусът. Сървърът (describeTerminalEvent) намира картата по чипа
 * и добавя името на апарата; сайтът ги показва в историята на картата и в
 * УСТРОЙСТВА. Наредба Н-7, прил. 3, т. 15 — следа от всяка проверка.
 *
 * Само от терминала. Без връзка Firestore пази записа и го праща после.
 */

export type TerminalEventKind =
    /** Картата е усетена, но чипът ѝ не се прочете нито веднъж (екранът казва „допрете отново“). */
    | 'miss'
    /** Прочетен е само чипът, адресът не — и чипът не е в системата. */
    | 'not_read'
    /** Целият адрес е прочетен, но такава карта няма. */
    | 'unknown'
    /** Няма интернет и няма запазени данни за картата. */
    | 'offline'
    /** Сканирана преди по-малко от 3 минути — пътуване не се записва. */
    | 'passback'
    /** Чипът не е този, който е записан за картата. */
    | 'cloned';

export interface TerminalEventDetails {
    /** Кодът, по който е търсена картата (от адреса, или чипът, ако адресът не се прочете). */
    readId?: string;
    /** Физическият номер на чипа. */
    uid?: string;
    /** Адресът на картата е прочетен докрай. */
    urlRead?: boolean;
    clientId?: string;
    /** При „вече сканирана“ — преди колко секунди. */
    secs?: number;
    /** При „не се прочете“ — колко опита е направил четецът. */
    attempts?: number;
}

const clean = (x: string | undefined, max: number) => (x || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, max);

export const logTerminalEvent = (kind: TerminalEventKind, details: TerminalEventDetails = {}): void => {
    if (!Capacitor.isNativePlatform()) return;
    const context = scanContext();
    const deviceId = typeof context.deviceId === 'string' ? context.deviceId : '';
    if (!deviceId) return;
    const at = new Date();
    const data: Record<string, unknown> = {
        ...context,
        at: at.toISOString(),
        kind,
        // Един ден на един терминал — по него УСТРОЙСТВА тегли екраните без съставен индекс.
        deviceDay: `${deviceId}_${sofiaDay(at.getTime())}`,
    };
    const readId = clean(details.readId, 64);
    const uid = clean(details.uid, 32).toUpperCase();
    const clientId = clean(details.clientId, 40);
    if (readId) data.readId = readId;
    if (uid) data.uid = uid;
    if (details.urlRead !== undefined) data.urlRead = details.urlRead;
    if (clientId) data.clientId = clientId;
    if (typeof details.secs === 'number' && isFinite(details.secs)) data.secs = Math.max(0, Math.round(details.secs));
    if (typeof details.attempts === 'number' && isFinite(details.attempts)) data.attempts = Math.max(0, Math.round(details.attempts));
    addDoc(collection(db, 'terminal_events'), data)
        .catch(err => console.error('Terminal event not kept:', err));
};
