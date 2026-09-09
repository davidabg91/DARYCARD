// Регистър на физическите карти: код в чипа → номер, отпечатан на картата.
//
// Първите 1000 карти са отпечатани и живеят в статичния src/data/cardsMapping.ts
// (номера 1 … 1000). Той не се пипа. Всяка НОВА карта си носи номера в Firestore:
//
//   counters/cards            { next: number }        — броячът, продължава от 1001
//   card_registry/{code}      { code, cardNumber, link, batchId, createdAt, ... }
//
// Броячът е в базата, а не в браузъра, за да не се повтарят номера, ако партида
// се генерира от друго устройство или след преинсталиране.

import { doc, collection, getDoc, runTransaction, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** Първият свободен номер: отпечатаните свършват на 1000. */
export const CARD_NUMBER_START = 1001;

/** Номерата са с водещи нули до 10 знака, както са вече отпечатаните. */
export const CARD_NUMBER_DIGITS = 10;

const COUNTER_DOC = 'cards';
const COUNTER_COLLECTION = 'counters';
export const CARD_REGISTRY_COLLECTION = 'card_registry';

/** Firestore има таван от 500 операции на batch — оставяме си луфт. */
const BATCH_LIMIT = 450;

export const formatCardNumber = (n: number): string =>
    String(Math.floor(n)).padStart(CARD_NUMBER_DIGITS, '0');

export interface RegistryCard {
    code: string;
    cardNumber: string;
    link: string;
}

/**
 * Заделя `count` последователни номера с транзакция и връща първия.
 * Ако документът го няма (първата партида), започва от CARD_NUMBER_START.
 */
export const reserveCardNumbers = async (count: number): Promise<number> => {
    if (count <= 0) throw new Error('Количеството трябва да е поне 1.');
    const ref = doc(db, COUNTER_COLLECTION, COUNTER_DOC);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const stored = snap.exists() ? Number(snap.data()?.next) : NaN;
        // Никога не тръгваме под 1001, дори броячът да е повреден или изтрит —
        // по-добре дупка в номерата, отколкото повторен номер.
        const start = Number.isFinite(stored) && stored >= CARD_NUMBER_START
            ? Math.floor(stored)
            : CARD_NUMBER_START;
        tx.set(ref, { next: start + count, updatedAt: new Date().toISOString() }, { merge: true });
        return start;
    });
};

/**
 * Записва партидата в card_registry — код, номер и линк заедно, преди картите
 * да са дадени на хора.
 */
export const registerGeneratedCards = async (
    cards: RegistryCard[],
    meta: { batchId: string; createdBy: string }
): Promise<void> => {
    const nowIso = new Date().toISOString();
    for (let i = 0; i < cards.length; i += BATCH_LIMIT) {
        const chunk = cards.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const card of chunk) {
            batch.set(doc(collection(db, CARD_REGISTRY_COLLECTION), card.code), {
                code: card.code,
                cardNumber: card.cardNumber,
                link: card.link,
                batchId: meta.batchId,
                createdBy: meta.createdBy,
                createdAt: nowIso,
                assignedTo: '',
            });
        }
        await batch.commit();
    }
};

/**
 * Номерът на карта по кода в чипа. Празен низ, ако картата не е от новите
 * партиди (тогава извикващият пада към CARDS_MAPPING).
 */
export const lookupCardNumber = async (code: string): Promise<string> => {
    if (!code) return '';
    try {
        const snap = await getDoc(doc(db, CARD_REGISTRY_COLLECTION, code));
        if (!snap.exists()) return '';
        const value = snap.data()?.cardNumber;
        return typeof value === 'string' ? value : '';
    } catch (err) {
        console.error('Регистърът на картите не се прочете:', err);
        return '';
    }
};

/** Отбелязва, че картата вече е дадена на клиент. Незадължително — не спира нищо. */
export const markCardAssigned = async (code: string, clientId: string): Promise<void> => {
    if (!code) return;
    try {
        await updateDoc(doc(db, CARD_REGISTRY_COLLECTION, code), {
            assignedTo: clientId,
            assignedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('Регистърът не се обнови (картата пак е активирана):', err);
    }
};
