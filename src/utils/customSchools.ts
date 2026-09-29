// Училища, въведени на ръка („Друго (въведи ръчно)...“), се запомнят в
// колекция custom_schools и оттам нататък излизат в падащите менюта до
// вградените от src/data/schools.ts — заедно с общината, с която са въведени.
//
//   custom_schools/{ключ}   { name, municipality, addedAt, addedBy }
//
// Ключът е името с главни букви и без излишни интервали, затова „пгрто“ и
// „ПГРТО “ са едно и също училище. Служител може само да добавя; поправка и
// изтриване остават за админ (виж firestore.rules).

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SCHOOLS, SCHOOL_MUNICIPALITY } from '../data/schools';

const COLLECTION = 'custom_schools';

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();
// Firestore не приема „/“ в ид, а encodeURIComponent го кодира.
const keyOf = (name: string) => encodeURIComponent(normalize(name));

interface CustomSchool { name: string; municipality: string }

// Един прочит за цялата сесия, споделен между формите.
let cache: Promise<CustomSchool[]> | null = null;
const loadCustomSchools = (): Promise<CustomSchool[]> => {
    if (!cache) {
        cache = getDocs(collection(db, COLLECTION))
            .then(snap => snap.docs.map(d => d.data() as CustomSchool).filter(s => s.name))
            .catch(err => { console.error('custom_schools', err); cache = null; return []; });
    }
    return cache;
};

/**
 * Вградените училища плюс запомнените, по азбучен ред, и общината на всяко.
 * `enabled` е за екрани, които отварят и нелогнати (шофьор, пътник) — те нямат
 * право да четат списъка и не им трябва.
 */
export function useSchools(enabled = true) {
    const [custom, setCustom] = useState<CustomSchool[]>([]);
    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        loadCustomSchools().then(list => { if (alive) setCustom(list); });
        return () => { alive = false; };
    }, [enabled]);

    return useMemo(() => {
        const municipalityOf: Record<string, string> = { ...SCHOOL_MUNICIPALITY };
        const known = new Set(SCHOOLS.map(normalize));
        for (const s of custom) {
            if (known.has(normalize(s.name))) continue;
            known.add(normalize(s.name));
            municipalityOf[s.name] = s.municipality || '';
        }
        const schools = Object.keys(municipalityOf).sort((a, b) => a.localeCompare(b, 'bg'));
        return { schools, municipalityOf };
    }, [custom]);
}

/**
 * Запомня ръчно въведено училище. Вече познато (вградено или запомнено) не се
 * пише пак. Грешка тук не бива да проваля записа на клиента, затова само се
 * логва.
 */
export async function rememberSchool(name: string, municipality: string, addedBy?: string) {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const n = normalize(clean);
    if (SCHOOLS.some(s => normalize(s) === n)) return;
    const existing = await loadCustomSchools();
    if (existing.some(s => normalize(s.name) === n)) return;
    const entry = { name: clean, municipality: municipality.trim() };
    try {
        await setDoc(doc(db, COLLECTION, keyOf(clean)), {
            ...entry,
            addedAt: new Date().toISOString(),
            addedBy: addedBy || ''
        });
        existing.push(entry);
    } catch (err) {
        // Най-често някой друг го е записал междувременно — правилата не
        // позволяват презапис от служител.
        console.error('rememberSchool', err);
    }
}
