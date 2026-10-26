// Пренасяне на разписанията от сайта (src/data/schedules.ts) в модела за
// Наредба Н-7 (src/utils/timetable.ts).
//
// Сайтът знае само часовете на тръгване — от Плевен и от крайната спирка — за
// делник, събота, неделя и (за някои линии) празник. Новият модел иска всяка
// спирка с час. Пренася се само това, което го има: часът на тръгване стои на
// първата спирка на курса, останалите клетки са празни. Времена за пътуване НЕ
// се измислят — грешка от пет минути значи изпуснат автобус. Междинните спирки
// идват от ROUTE_METADATA.stops (без часове), координати няма никъде.
//
// Каквото не може да се пренесе честно, отива в `notes` на линията и се вижда в
// „Разписания“.
//
// Чиста функция: не пише в базата. Записът е в TimetablesPanel.

import { SCHEDULES, type RouteSchedule, type ScheduleTime } from '../data/schedules';
import { ROUTE_METADATA } from '../data/routeMetadata';
import { routeSlug } from '../data/routeSlugs';
import { normalizeTime, STANDARD_SERVICES, toMinutes, type Direction, type Timetable, type Trip } from './timetable';

/** Съкращенията от ROUTE_METADATA.stops, разгърнати — спирката носи пълното име. */
const FULL_NAMES: Record<string, string> = {
    'Д.М': 'Долна Митрополия',
    'Г.М': 'Горна Митрополия',
    'Д. Дъбник': 'Долни Дъбник',
    'Г. Дъбник': 'Горни Дъбник',
    'Д.Митрополия': 'Долна Митрополия',
};
export const fullStopName = (name: string) => FULL_NAMES[name.trim()] || name.trim();

/** Ид на спирка: латиница от името, за да не се дублира при повторен внос. */
export const stopIdFor = (name: string) => routeSlug(fullStopName(name));

/**
 * Откъде тръгват „обратните“ курсове, когато не е от самата линия. Същото като
 * `originMapping` в BusSchedule.tsx — там е таблото „ОТ …“ над часовете.
 */
const RETURN_FROM: Record<string, string> = {
    'Божурица': 'Рибен', 'Победа': 'Рибен', 'Биволаре': 'Рибен',
    'Градина': 'Бъркач', 'Дисевица': 'Бъркач', 'Търнене': 'Бъркач', 'Петърница': 'Бъркач',
    'Крушовица': 'Садовец', 'Ореховица': 'Байкал', 'Брегаре': 'Байкал', 'Крушовене': 'Байкал',
};

type DayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday';
const DAY_KINDS: DayKind[] = ['weekday', 'saturday', 'sunday', 'holiday'];

/** Кое разписание показва сайтът в този вид ден — същата логика като BusSchedule. */
const effective = (s: RouteSchedule, kind: DayKind): ScheduleTime => {
    if (kind === 'saturday') return s.saturday ?? s;
    if (kind === 'sunday') return s.sunday ?? s;
    if (kind === 'holiday') return s.holiday ?? s.sunday ?? s;
    return s;
};

const clean = (t: string) => normalizeTime(t.replace('*', ''));

const parsePrice = (value?: string): number | null => {
    if (!value) return null;
    const n = parseFloat(value.replace('€', '').trim());
    return isFinite(n) && n > 0 ? n : null;
};

export interface ImportPlan {
    stops: Array<{ id: string; name: string }>;
    timetables: Timetable[];
}

export const buildImportPlan = (): ImportPlan => {
    const keys = Object.keys(SCHEDULES);
    const stops = new Map<string, string>();
    const byName = new Map<string, Timetable>();

    // Ореховица носи `via`: кой курс от Плевен докъде стига по коридора за
    // Ставерци – Гостиля – Кнежа. Един и същ за всички, които го носят.
    const via: Record<string, string> = {};
    keys.forEach(k => Object.entries(SCHEDULES[k].via || {}).forEach(([t, v]) => { via[clean(t)] = v; }));
    const corridor = new Set(Object.values(via));

    for (const name of keys) {
        const s = SCHEDULES[name];
        const notes: string[] = [];
        const servedBy: string[] = [];
        const stopNames = (ROUTE_METADATA[name]?.stops?.length ? ROUTE_METADATA[name].stops : ['Плевен', name]).map(fullStopName);
        stopNames.forEach(n => stops.set(stopIdFor(n), n));
        const ids = stopNames.map(stopIdFor);
        const tt: Timetable = {
            routeId: routeSlug(name),
            name,
            fare: parsePrice(ROUTE_METADATA[name]?.priceSingle),
            servedBy,
            notes,
            directions: [
                { id: 'A', stopIds: ids, trips: [] },
                { id: 'B', stopIds: [...ids].reverse(), trips: [] },
            ],
        };
        byName.set(name, tt);

        // ── Линии без собствени курсове ────────────────────────────────────
        const earlier = keys.slice(0, keys.indexOf(name));
        const sameObject = earlier.find(p => SCHEDULES[p] === s);
        if (sameObject) {
            // Брегаре = Ореховица, която сама няма курсове: сочи направо там, където са.
            const through = byName.get(sameObject)!.servedBy;
            servedBy.push(...(through.length ? through : [sameObject]));
            notes.push(through.length
                ? `На сайта разписанието е същото като на „${sameObject}“ — събрано от линиите ${through.map(x => `„${x}“`).join(', ')}; курсовете са там. Тази линия не се публикува отделно.`
                : `На сайта разписанието е същото като на линия „${sameObject}“ — курсовете са там. Тази линия не се публикува отделно.`);
            continue;
        }
        if (s.via) {
            const returnFrom = earlier.filter(p => SCHEDULES[p].fromDestination === s.fromDestination && !byName.get(p)!.servedBy.length);
            servedBy.push(...returnFrom, ...[...corridor].filter(c => c !== name));
            notes.push(`На сайта часовете са събрани от линиите ${servedBy.map(x => `„${x}“`).join(', ')} — курсовете са там. Тази линия не се публикува отделно.`);
            continue;
        }
        const sharedOut = earlier.find(p => !SCHEDULES[p].via && SCHEDULES[p].fromPleven === s.fromPleven);
        if (sharedOut) {
            servedBy.push(sharedOut);
            // Часовете „към Плевен“ на тази спирка са часове на същия курс по
            // линия sharedOut, на тази спирка — вписват се там по-долу.
            continue;
        }

        // ── Собствени курсове ─────────────────────────────────────────────
        const returnFrom = RETURN_FROM[name];
        if (returnFrom) {
            notes.push(`Обратните курсове на сайта тръгват от ${returnFrom}, не от ${name} — не са пренесени. Въведете ги на ръка.`);
        }
        if (!s.saturday || !s.sunday) {
            const missing = [!s.saturday && 'събота', !s.sunday && 'неделя'].filter(Boolean).join(' и ');
            notes.push(`На сайта няма отделно разписание за ${missing} — пренесени са делничните часове, както ги показва сайтът. Проверете дали линията наистина се движи тогава.`);
        }
        if (!s.holiday) {
            notes.push('Празник: пренесени са неделните часове, както ги показва сайтът.');
        }
        if ([s, s.saturday, s.sunday, s.holiday].some(d => d && [...d.fromPleven, ...d.fromDestination].some(t => t.includes('*')))) {
            notes.push('Някои часове на сайта са със звездичка (*) — пренесени са без бележката. Проверете какво означава и дали курсът е същият.');
        }

        const [dirA, dirB] = tt.directions;
        for (const kind of DAY_KINDS) {
            const day = effective(s, kind);
            for (const raw of day.fromPleven) {
                const t = clean(raw);
                // По коридора за Кнежа курсът стои на линията, докъдето стига.
                if (corridor.has(name) && via[t] && via[t] !== name) continue;
                dirA.trips.push(trip(kind, t, dirA));
            }
            if (!returnFrom) {
                for (const raw of day.fromDestination) dirB.trips.push(trip(kind, clean(raw), dirB));
            }
        }
        sortTrips(dirA);
        sortTrips(dirB);
    }

    // ── Часовете към Плевен от спирките по пътя ─────────────────────────────
    // Гривица, Згалево, Пордим, Одърне имат на сайта свои часове „към Плевен“,
    // а курсът „от Плевен“ е общ с Каменец. Това са часовете на същите курсове
    // от Каменец, на тези спирки — вписват се в Каменец, ако се подреждат.
    for (const name of keys) {
        const tt = byName.get(name)!;
        const parentName = tt.servedBy[0];
        const s = SCHEDULES[name];
        if (!parentName || SCHEDULES[parentName].fromPleven !== s.fromPleven || SCHEDULES[parentName] === s) continue;
        const parent = byName.get(parentName)!;
        const back = parent.directions[1];
        const at = back.stopIds.indexOf(stopIdFor(name));
        const merged: string[] = [];
        const failed: string[] = [];
        for (const kind of DAY_KINDS) {
            const mine = effective(s, kind).fromDestination.map(clean);
            const runs = back.trips.filter(t => t.serviceId === kind);
            const fits = at > 0 && mine.length === runs.length && runs.every((r, i) => {
                const prev = r.times.slice(0, at).map(toMinutes).filter((m): m is number => m !== null).pop();
                const later = r.times.slice(at + 1).map(toMinutes).filter((m): m is number => m !== null)[0];
                const m = toMinutes(mine[i]);
                return m !== null && prev !== undefined && m > prev && (later === undefined || m < later);
            });
            if (fits) {
                runs.forEach((r, i) => { r.times[at] = mine[i]; });
                merged.push(serviceName(kind));
            } else if (mine.length) {
                failed.push(serviceName(kind));
            }
        }
        tt.notes.push(`Курсовете са на линия „${parentName}“ (общ курс от Плевен). Тази линия не се публикува отделно.`);
        if (merged.length) tt.notes.push(`Часовете към Плевен от ${name} са вписани в „${parentName}“ на спирка ${name} (${merged.join(', ')}).`);
        if (failed.length) {
            tt.notes.push(`Часовете към Плевен от ${name} за ${failed.join(', ')} не се подреждат с курсовете на „${parentName}“ — не са вписани. Въведете ги на ръка.`);
            parent.notes.push(`Часовете от ${name} за ${failed.join(', ')} не бяха вписани автоматично — вижте линия „${name}“.`);
        }
    }

    return {
        stops: [...stops].map(([id, name]) => ({ id, name })),
        timetables: keys.map(k => byName.get(k)!),
    };
};

const serviceName = (id: string) => STANDARD_SERVICES.find(s => s.id === id)?.name || id;

/** Ид на курса: режим + час, за да остане същото при повторен внос (и trip_id в GTFS с него). */
const trip = (serviceId: DayKind, time: string, dir: Direction): Trip => {
    const base = `${serviceId}-${time.replace(':', '')}`;
    let id = base;
    for (let n = 2; dir.trips.some(t => t.id === id); n++) id = `${base}-${n}`;
    const times = dir.stopIds.map(() => '');
    times[0] = time;
    return { id, serviceId, times };
};

const ORDER: Record<string, number> = { weekday: 0, saturday: 1, sunday: 2, holiday: 3 };
const sortTrips = (dir: Direction) => {
    dir.trips.sort((a, b) => (ORDER[a.serviceId] - ORDER[b.serviceId]) || ((toMinutes(a.times[0]) ?? 0) - (toMinutes(b.times[0]) ?? 0)));
};
