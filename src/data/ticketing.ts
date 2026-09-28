import { ROUTE_METADATA } from './routeMetadata';

/**
 * Данните зад билета, който шофьорът печата от терминала.
 *
 * Линиите и спирките идват от `ROUTE_METADATA` — същия източник, от който се
 * пълни и сайтът, за да няма два списъка, които да се разминават.
 */

/** Фирмени данни за заглавката на билета (от страницата „Правна информация"). */
export const CARRIER = {
    name: '„ДАРИ КОМЕРС - НА“ ООД',
    address: 'гр. Плевен, ул. Данаил Попов 12',
    eik: '114601542',
    vat: 'BG114601542',
} as const;

/** Спирките в данните са със съкращения; на билета трябва да стои пълното име. */
const FULL_NAME: Record<string, string> = {
    'Д.М': 'Долна Митрополия',
    'Г.М': 'Горна Митрополия',
    'Д. Дъбник': 'Долни Дъбник',
    'Г. Дъбник': 'Горни Дъбник',
};

export const stopName = (stop: string): string => FULL_NAME[stop] || stop;

export interface TicketLine {
    /** Името на линията, както е в ROUTE_METADATA — то е и крайната точка. */
    id: string;
    stops: string[];
    /** Цена на еднопосочен билет за линията, в евро. null = няма цена в данните. */
    price: number | null;
}

/** „2.00 €" → 2, „---" → null */
const parsePrice = (raw?: string): number | null => {
    if (!raw) return null;
    const m = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
};

/**
 * Линиите, между които шофьорът избира. Иска се поне две спирки (иначе няма
 * посока) и цена (иначе няма какво да се напише на билета).
 */
export const ticketLines = (): TicketLine[] =>
    Object.entries(ROUTE_METADATA)
        .map(([id, meta]) => ({ id, stops: meta.stops || [], price: parsePrice(meta.priceSingle) }))
        .filter(l => l.stops.length >= 2 && l.price !== null)
        .sort((a, b) => a.id.localeCompare(b.id, 'bg'));

export interface Destination {
    from: string;
    to: string;
    /** Пълни имена, готови за печат. */
    fromName: string;
    toName: string;
    price: number;
    /** Истина за отсечките от/до първата спирка — те са най-честите. */
    primary: boolean;
}

/**
 * Посоките за една линия. Първо тези от и към първата спирка (обикновено Плевен)
 * в двете посоки — това са всекидневните; после останалите отсечки, за когато
 * някой се качва по средата.
 */
export const destinationsFor = (line: TicketLine, overrides: PriceOverrides = TICKET_PRICES): Destination[] => {
    const { stops } = line;
    const out: Destination[] = [];
    const seen = new Set<string>();

    const add = (from: string, to: string, primary: boolean) => {
        if (from === to) return;
        const key = `${from}>${to}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            from, to,
            fromName: stopName(from),
            toName: stopName(to),
            price: priceFor(line, from, to, overrides),
            primary,
        });
    };

    const origin = stops[0];
    for (let i = 1; i < stops.length; i++) add(origin, stops[i], true);
    for (let i = 1; i < stops.length; i++) add(stops[i], origin, true);
    for (let i = 1; i < stops.length; i++) {
        for (let j = 1; j < stops.length; j++) add(stops[i], stops[j], false);
    }
    return out;
};

export type PriceOverrides = Record<string, number>;

/**
 * Цени по отсечки.
 *
 * В сайта има ЕДНА цена на еднопосочен билет за цялата линия — няма цени по
 * отделни спирки. Затова по подразбиране всяка отсечка взима цената на линията,
 * а тук се вписват изключенията. Ключът е `ЛИНИЯ|ОТ|ДО` с имената точно както са
 * в `stops` (със съкращенията), напр. `Горна Митрополия|Плевен|Опанец`.
 *
 * ПОПЪЛВА СЕ ОТ ПРЕВОЗВАЧА — докато е празно, билетът носи цената на линията.
 */
export const TICKET_PRICES: PriceOverrides = {
    // 'Горна Митрополия|Плевен|Опанец': 1.50,
};

export const priceKey = (lineId: string, from: string, to: string) => `${lineId}|${from}|${to}`;

export const priceFor = (
    line: TicketLine,
    from: string,
    to: string,
    overrides: PriceOverrides = TICKET_PRICES,
): number => {
    const exact = overrides[priceKey(line.id, from, to)];
    if (typeof exact === 'number') return exact;
    // Обратната посока струва същото, ако не е казано друго.
    const reverse = overrides[priceKey(line.id, to, from)];
    if (typeof reverse === 'number') return reverse;
    return line.price ?? 0;
};

export const formatPrice = (value: number): string => `${value.toFixed(2)} €`;
