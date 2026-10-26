// Тарифите за Наредба Н-7: единичен билет и месечни карти по вид пътник.
//
// В DARY цената зависи от това откъде докъде пътуваш, не от кой автобус се
// качиш: Плевен → Дисевица струва различно от Плевен → Бъркач, макар че е един
// и същ автобус. Затова всяка ценова линия от ROUTE_METADATA става тарифа между
// първата и последната ѝ спирка — включително отсечките като „Долна Митрополия -
// Тръстеник“, които нямат свое разписание.
//
// Източникът остава ROUTE_METADATA (там се продават картите). Таб РАЗПИСАНИЯ
// преписва оттук в колекция `fares`, за да може функцията `gtfs` да ги чете.

import { ROUTE_METADATA, cardPrice } from '../data/routeMetadata';
import { routeSlug } from '../data/routeSlugs';
import { fullStopName, stopIdFor } from './timetableImport';

/** Видовете пътници с месечна карта. Служебната е безплатна за персонала — не е тарифа. */
export const RIDER_CATEGORIES = [
    { id: 'regular', cardType: 'Нормална карта', name: 'Редовен пътник' },
    { id: 'student', cardType: 'Ученическа карта', name: 'Ученик' },
    { id: 'pensioner', cardType: 'Пенсионерска карта', name: 'Пенсионер' },
    { id: 'teacher', cardType: 'Учителска карта', name: 'Учител' },
    { id: 'disabled', cardType: 'Инвалидна карта', name: 'Лице с увреждане' },
] as const;

export type RiderCategory = typeof RIDER_CATEGORIES[number]['id'];

export interface Fare {
    /** routeSlug(име) */
    id: string;
    name: string;
    fromStopId: string;
    toStopId: string;
    fromName: string;
    toName: string;
    /** Единичен билет в евро; null, ако линията няма. */
    single: number | null;
    /** Месечна карта по вид пътник; липсващ ключ = няма такава карта. */
    passes: Partial<Record<RiderCategory, number>>;
}

const price = (v?: string): number | null => {
    if (!v) return null;
    const n = parseFloat(v.replace('€', '').trim());
    return isFinite(n) && n > 0 ? n : null;
};

export const buildFareTable = (): Fare[] =>
    Object.entries(ROUTE_METADATA).flatMap(([name, meta]) => {
        const stops = meta.stops?.length ? meta.stops : ['Плевен', name];
        if (stops.length < 2) return [];
        const passes: Fare['passes'] = {};
        RIDER_CATEGORIES.forEach(c => {
            const p = cardPrice(name, c.cardType);
            if (p !== null && p > 0) passes[c.id] = p;
        });
        const single = price(meta.priceSingle);
        if (single === null && !Object.keys(passes).length) return [];
        const from = stops[0];
        const to = stops[stops.length - 1];
        return [{
            id: routeSlug(name),
            name,
            fromStopId: stopIdFor(from),
            toStopId: stopIdFor(to),
            fromName: fullStopName(from),
            toName: fullStopName(to),
            single,
            passes,
        }];
    });

/** Еднакви ли са записаният документ и таблицата — за да се пише само при промяна. */
export const sameFare = (a: Fare, b: Record<string, unknown> | undefined) =>
    !!b && JSON.stringify(a) === JSON.stringify({
        id: b.id, name: b.name, fromStopId: b.fromStopId, toStopId: b.toStopId,
        fromName: b.fromName, toName: b.toName, single: b.single ?? null,
        passes: Object.fromEntries(RIDER_CATEGORIES.filter(c => typeof (b.passes as Record<string, unknown> | undefined)?.[c.id] === 'number')
            .map(c => [c.id, (b.passes as Record<string, number>)[c.id]])),
    });
