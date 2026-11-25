// Сканиранията за КОНТРОЛ НА ЗЛОУПОТРЕБИ в ТАБЛО.
//
// Проверката търси карти с повече от 3 пътувания за ден. Преди панелът теглеше
// всички сканирания за 14 дни — 17 000 документа, 21 MB — за да покаже пет
// реда. Сега чете `scan_days`: по един документ на карта на ден, и то само
// дните над прага (поддържа ги функцията summarizeScanDay, виж
// functions/src/scanDays.ts). Смятането в панела е същото — само че получава
// сканиранията на подозрителните дни, а не на всички.
//
// Обобщението не се показва на доверие. Преди първото показване и на всеки
// 5 минути след това се сверява с истинските сканирания:
//   – за отминалите дни в прозореца броят трябва да съвпада точно;
//   – за днес обобщението може да изостава с до 3 сканирания (функцията ги
//     пренася за секунда-две).
// Три поредни несъвпадения значат, че функцията не работи — тогава панелът
// минава на стария начин и чете самите сканирания.

import { useEffect, useRef, useState } from 'react';
import {
    collection, collectionGroup, getCountFromServer, getDocsFromServer,
    onSnapshot, query, where, type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface AbuseScan {
    clientId: string;
    at: string;
    route: string;
    /** Името на терминала от УСТРОЙСТВА, ако се знае. */
    deviceName?: string;
}

const LAG_GRACE_MS = 20_000;
const RECHECK_MS = 5 * 60 * 1000;
const STRIKES = 3;
/** С толкова сканирания може да изостава обобщението за днес. */
const TODAY_LAG = 3;

/** Съвпада ли обобщението с истинските сканирания в прозореца. */
const summaryMatches = async (windowStart: string): Promise<boolean> => {
    const today = new Date().toISOString().split('T')[0];
    const scans = collectionGroup(db, 'scans');
    const [past, current, totals] = await Promise.all([
        getCountFromServer(query(scans, where('at', '>=', windowStart), where('at', '<', today))),
        getCountFromServer(query(scans, where('at', '>=', today))),
        getDocsFromServer(query(collection(db, 'scan_day_totals'), where('date', '>=', windowStart))),
    ]);
    let sumPast = 0;
    let sumCurrent = 0;
    totals.forEach(d => {
        const total = Number(d.data().total) || 0;
        if (String(d.data().date) < today) sumPast += total;
        else sumCurrent += total;
    });
    const lag = current.data().count - sumCurrent;
    return past.data().count === sumPast && lag >= 0 && lag <= TODAY_LAG;
};

export function useAbuseScans(
    armed: boolean,
    windowStart: string,
    /** Как панелът превръща истинските сканирания в записи — за стария начин. */
    rawToRecords: (snap: QuerySnapshot) => AbuseScan[],
) {
    const [source, setSource] = useState<'summary' | 'raw'>('summary');
    const [summary, setSummary] = useState<AbuseScan[] | null>(null);
    const [verified, setVerified] = useState(false);
    const [raw, setRaw] = useState<AbuseScan[] | null>(null);
    const [rawFailed, setRawFailed] = useState(false);

    const toRecords = useRef(rawToRecords);
    useEffect(() => { toRecords.current = rawToRecords; });

    // Дните над прага от обобщението.
    useEffect(() => {
        if (!armed || source !== 'summary') return;
        const q = query(collection(db, 'scan_days'), where('flagDate', '>=', windowStart));
        return onSnapshot(q, (snap) => {
            const list: AbuseScan[] = [];
            snap.forEach(d => {
                const data = d.data() as { clientId?: string; scans?: Record<string, { at?: string; trip?: boolean; device?: string }> };
                if (!data.clientId) return;
                for (const e of Object.values(data.scans || {})) {
                    if (!e?.trip || !e.at) continue;
                    list.push({ clientId: data.clientId, at: e.at, route: '', deviceName: e.device || undefined });
                }
            });
            // Както ги връщаше заявката по `at` — по час.
            list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
            setSummary(list);
        }, (err) => {
            console.warn('Обобщението на сканиранията не се чете — минавам на самите сканирания:', err);
            setSource('raw');
        });
    }, [armed, source, windowStart]);

    // Сверка със самите сканирания.
    useEffect(() => {
        if (!armed || source !== 'summary') return;
        let stopped = false;
        let strikes = 0;
        let passedOnce = false;
        let timer: ReturnType<typeof setTimeout>;
        const strike = () => {
            if (++strikes >= STRIKES) {
                console.warn('Обобщението на сканиранията изостава — минавам на самите сканирания.');
                setSource('raw');
            } else {
                timer = setTimeout(run, LAG_GRACE_MS);
            }
        };
        const run = async () => {
            try {
                const ok = await summaryMatches(windowStart);
                if (stopped) return;
                if (ok) {
                    strikes = 0;
                    passedOnce = true;
                    setVerified(true);
                    timer = setTimeout(run, RECHECK_MS);
                } else {
                    strike();
                }
            } catch {
                if (stopped) return;
                // Без връзка нищо не се знае за обобщението. Вече провереното
                // остава на екрана; непровереното не се показва на доверие.
                if (passedOnce) timer = setTimeout(run, RECHECK_MS);
                else strike();
            }
        };
        void run();
        return () => { stopped = true; clearTimeout(timer); };
    }, [armed, source, windowStart]);

    // Старият начин: всички сканирания в прозореца.
    useEffect(() => {
        if (!armed || source !== 'raw') return;
        const q = query(collectionGroup(db, 'scans'), where('at', '>=', windowStart));
        return onSnapshot(q, (snap) => {
            setRaw(toRecords.current(snap));
        }, (err) => {
            console.error('Abuse scans listener error:', err);
            setRawFailed(true);
        });
    }, [armed, source, windowStart]);

    return source === 'summary'
        ? { scans: summary ?? [], loading: !(summary && verified), source }
        : { scans: raw ?? [], loading: raw === null && !rawFailed, source };
}
