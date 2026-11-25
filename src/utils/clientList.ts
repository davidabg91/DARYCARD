// Списъкът с клиенти за `/admin`.
//
// Преди панелът слушаше цялата колекция `clients` — 1 395 документа, 18 MB — и
// всяко сканиране в автобус му пращаше целия клиентски документ наново, защото
// сканирането пипа броячите в него. Сега слуша `clients_index`: същите клиенти
// без снимките, историята и броячите (поддържа го функцията mirrorClientIndex,
// виж functions/src/clientIndex.ts). Сканиране вече не стига до панела изобщо.
//
// Три неща пазят от изостанал или липсващ списък:
//
//   1. „Горещи“ клиенти. Всеки клиент, който панелът отваря или променя, се
//      слуша и с пълния си документ, и той покрива реда от списъка. Така
//      подновяване се вижда веднага — местният запис стига до слушателя преди
//      сървъра — вместо след секунда-две, докато функцията пренесе промяната.
//      Оттам идват и тежките полета за отворения профил.
//   2. Проверка срещу източника. Броят, сборът на платеното и броят анулирани
//      се сверяват със сървъра (три числа, без да се тегли нищо). Разминаване
//      три пъти подред значи, че функцията не работи — тогава панелът минава
//      на цялата колекция, както беше преди.
//   3. Празен или отказан списък (функцията или правилата още не са качени) —
//      пак цялата колекция.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    collection, count, doc, getAggregateFromServer, getCountFromServer,
    onSnapshot, query, sum, where,
} from 'firebase/firestore';
import { db } from '../firebase';

export const CLIENT_INDEX = 'clients_index';

/** Колко клиента се слушат с пълния си документ едновременно. */
const MAX_HOT = 60;
/** Проверката срещу източника: първа, повторна при разминаване, редовна. */
const FIRST_CHECK_MS = 4000;
const LAG_GRACE_MS = 20_000;
const RECHECK_MS = 5 * 60 * 1000;
const STRIKES = 3;

type Source = 'index' | 'full';
interface Listed { id: string; amountPaid?: unknown; isCanceled?: unknown }

/** Съвпада ли списъкът с `clients` по трите числа, които показват плащане или анулиране. */
const matchesSource = async (list: () => Listed[]): Promise<boolean> => {
    const col = collection(db, 'clients');
    const [totals, canceled] = await Promise.all([
        getAggregateFromServer(col, { n: count(), paid: sum('amountPaid') }),
        getCountFromServer(query(col, where('isCanceled', '==', true))),
    ]);
    // Списъкът се чете СЛЕД отговора — иначе сравняваме с по-старо състояние.
    const now = list();
    const paid = now.reduce((acc, c) =>
        acc + (typeof c.amountPaid === 'number' && Number.isFinite(c.amountPaid) ? c.amountPaid : 0), 0);
    const serverPaid = totals.data().paid;
    return totals.data().n === now.length
        && canceled.data().count === now.filter(c => c.isCanceled === true).length
        // Сборът е от дробни числа, събрани в различен ред — затова с допуск.
        && (!Number.isFinite(serverPaid) || Math.abs(serverPaid - paid) < 0.5);
};

export function useClientList<T extends Listed>() {
    const [source, setSource] = useState<Source>('index');
    const [base, setBase] = useState<T[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    // Потвърден ли е списъкът от сървъра — преди това няма с какво да се сверява.
    const [serverSeen, setServerSeen] = useState(false);

    const baseRef = useRef<T[]>(base);
    useEffect(() => { baseRef.current = base; }, [base]);

    useEffect(() => {
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = onSnapshot(
            collection(db, source === 'index' ? CLIENT_INDEX : 'clients'),
            (snapshot) => {
                const fromServer = !snapshot.metadata.fromCache;
                if (source === 'index' && fromServer && snapshot.empty) {
                    console.warn('Лекият списък на клиентите е празен — минавам на цялата колекция.');
                    setSource('full');
                    return;
                }
                const list: T[] = [];
                snapshot.forEach(d => list.push({ ...d.data(), id: d.id } as T));
                setBase(list);
                // Празна снимка от студения кеш не значи „няма клиенти“ — чакаме сървъра.
                if (list.length > 0 || fromServer) setLoaded(true);
                if (fromServer) setServerSeen(true);
                setError(false);
            },
            (err) => {
                if (source === 'index') {
                    console.warn('Лекият списък на клиентите не се чете — минавам на цялата колекция:', err);
                    setSource('full');
                    return;
                }
                console.error('Firestore error:', err);
                setError(true);
                // Слушател с грешка е мъртъв — абонираме наново след малко.
                retryTimer = setTimeout(() => setRetryKey(k => k + 1), 4000);
            },
        );
        return () => {
            unsubscribe();
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [source, retryKey]);

    useEffect(() => {
        if (source !== 'index' || !serverSeen) return;
        let stopped = false;
        let strikes = 0;
        let timer: ReturnType<typeof setTimeout>;
        const run = async () => {
            try {
                const ok = await matchesSource(() => baseRef.current);
                if (stopped) return;
                if (ok) {
                    strikes = 0;
                    timer = setTimeout(run, RECHECK_MS);
                } else if (++strikes >= STRIKES) {
                    console.warn('Лекият списък на клиентите изостава от базата — минавам на цялата колекция.');
                    setSource('full');
                } else {
                    // Вероятно промяна, която функцията още пренася.
                    timer = setTimeout(run, LAG_GRACE_MS);
                }
            } catch {
                // Няма връзка или отказ — това не казва нищо за списъка.
                if (!stopped) timer = setTimeout(run, RECHECK_MS);
            }
        };
        timer = setTimeout(run, FIRST_CHECK_MS);
        return () => { stopped = true; clearTimeout(timer); };
    }, [source, serverSeen]);

    // ── „Горещи“ клиенти ────────────────────────────────────────────────────
    // `null` значи потвърдено изтрит; липсващ ключ — още няма отговор.
    const [hot, setHot] = useState<Record<string, T | null>>({});
    const subs = useRef(new Map<string, () => void>());

    const watch = useCallback((id: string | undefined | null) => {
        if (!id || subs.current.has(id)) return;
        if (subs.current.size >= MAX_HOT) {
            const oldest = subs.current.keys().next().value as string;
            subs.current.get(oldest)?.();
            subs.current.delete(oldest);
            setHot(prev => {
                const next = { ...prev };
                delete next[oldest];
                return next;
            });
        }
        subs.current.set(id, onSnapshot(doc(db, 'clients', id), (snap) => {
            if (snap.exists()) {
                setHot(prev => ({ ...prev, [id]: { ...snap.data(), id: snap.id } as T }));
            } else if (!snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
                // Липсващ документ в студения кеш не значи изтрит клиент.
                setHot(prev => ({ ...prev, [id]: null }));
            }
        }, (err) => console.error('Клиентът не се чете:', id, err)));
    }, []);

    useEffect(() => {
        const live = subs.current;
        return () => {
            live.forEach(unsub => unsub());
            live.clear();
        };
    }, []);

    const clients = useMemo(() => {
        const ids = Object.keys(hot);
        if (ids.length === 0) return base;
        const inBase = new Set<string>();
        const merged: T[] = [];
        for (const c of base) {
            inBase.add(c.id);
            const over = hot[c.id];
            if (over === null) continue;
            merged.push(over ?? c);
        }
        // Току-що създаден клиент, който функцията още не е пренесла в списъка.
        for (const id of ids) {
            const over = hot[id];
            if (over && !inBase.has(id)) merged.push(over);
        }
        return merged;
    }, [base, hot]);

    const retry = useCallback(() => setRetryKey(k => k + 1), []);

    return { clients, loaded, error, retry, watch, hot, source };
}
