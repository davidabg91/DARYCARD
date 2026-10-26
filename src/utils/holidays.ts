export interface Holiday {
    date: string; // "YYYY-MM-DD"
    name: string;
}

/**
 * The official days off in Bulgaria, for any year.
 *
 * This used to be a hand-typed list for 2026. A timetable runs on these days —
 * a weekday bus does not, the Sunday one does — and a timetable outlives the
 * year it was entered in, so the list is worked out instead.
 *
 * The rules are the Кодекс на труда's (чл. 154): the fixed holidays, Easter
 * from Good Friday to Easter Monday, and a fixed holiday that lands on a Saturday
 * or Sunday moves to the first working day after it — Easter excepted. Christmas
 * Eve to the 26th moves as many working days as it lost to the weekend.
 *
 * What this cannot know is a day the government adds by decision, a bridge
 * between a holiday and a weekend. Those are announced months ahead and have to
 * be added by hand.
 */

const FIXED: Array<[number, number, string]> = [
    [1, 1, 'Нова година'],
    [3, 3, 'Ден на Освобождението на България'],
    [5, 1, 'Ден на труда и международната работническа солидарност'],
    [5, 6, 'Гергьовден, Ден на храбростта и Българската армия'],
    [5, 24, 'Ден на българската просвета, култура и славянската писменост'],
    [9, 6, 'Ден на Съединението'],
    [9, 22, 'Ден на Независимостта на България'],
];

const CHRISTMAS: Array<[number, string]> = [
    [24, 'Бъдни вечер'],
    [25, 'Коледа'],
    [26, 'Коледа'],
];

const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Orthodox Easter Sunday, in the Gregorian calendar (valid 1900–2099). */
export const orthodoxEaster = (year: number): Date => {
    const a = year % 4;
    const b = year % 7;
    const c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31);
    const day = ((d + e + 114) % 31) + 1;
    // Julian date, plus the thirteen days the calendars are apart this century.
    return new Date(year, month - 1, day + 13);
};

const cache = new Map<number, Holiday[]>();

export const holidaysFor = (year: number): Holiday[] => {
    const cached = cache.get(year);
    if (cached) return cached;

    const list: Holiday[] = [];
    const taken = new Set<string>();
    const add = (d: Date, name: string) => {
        const key = iso(d);
        if (taken.has(key)) return;
        taken.add(key);
        list.push({ date: key, name });
    };
    /** The first working day on or after `from` that is not already a holiday. */
    const nextFree = (from: Date) => {
        let d = from;
        while (isWeekend(d) || taken.has(iso(d))) d = addDays(d, 1);
        return d;
    };

    const easter = orthodoxEaster(year);
    add(addDays(easter, -2), 'Великден (Велики петък)');
    add(addDays(easter, -1), 'Великден (Велика събота)');
    add(easter, 'Великден');
    add(addDays(easter, 1), 'Великден (Светли понеделник)');

    for (const [m, d] of FIXED) taken.add(iso(new Date(year, m - 1, d)));
    for (const [d] of CHRISTMAS) taken.add(iso(new Date(year, 11, d)));

    for (const [m, d, name] of FIXED) {
        const day = new Date(year, m - 1, d);
        list.push({ date: iso(day), name });
        if (isWeekend(day)) add(nextFree(addDays(day, 1)), `${name} (прехвърлен)`);
    }

    let lost = 0;
    for (const [d, name] of CHRISTMAS) {
        const day = new Date(year, 11, d);
        list.push({ date: iso(day), name });
        if (isWeekend(day)) lost++;
    }
    let from = new Date(year, 11, 27);
    for (let i = 0; i < lost; i++) {
        const day = nextFree(from);
        add(day, 'Почивен ден (заради Коледа в почивен ден)');
        from = addDays(day, 1);
    }

    list.sort((x, y) => x.date.localeCompare(y.date));
    cache.set(year, list);
    return list;
};

export const HOLIDAYS_2026: Holiday[] = holidaysFor(2026);

/**
 * Returns holiday information for a given date, or null if it's not a holiday.
 */
export const getHoliday = (date: Date): Holiday | null => {
    // We use local time for holiday detection
    const dateString = iso(date);
    return holidaysFor(date.getFullYear()).find(h => h.date === dateString) || null;
};
