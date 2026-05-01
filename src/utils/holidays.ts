export interface Holiday {
    date: string; // "YYYY-MM-DD"
    name: string;
}

export const HOLIDAYS_2026: Holiday[] = [
    { date: '2026-01-01', name: 'Нова година' },
    { date: '2026-03-03', name: 'Ден на Освобождението на България' },
    { date: '2026-04-10', name: 'Великден (Велики петък)' },
    { date: '2026-04-11', name: 'Великден (Велика събота)' },
    { date: '2026-04-12', name: 'Великден' },
    { date: '2026-04-13', name: 'Великден (Светли понеделник)' },
    { date: '2026-05-01', name: 'Ден на труда и международната работническа солидарност' },
    { date: '2026-05-06', name: 'Гергьовден, Ден на храбростта и Българската армия' },
    { date: '2026-05-25', name: 'Ден на българската просвета, култура и славянската писменост (прехвърлен)' },
    { date: '2026-09-07', name: 'Ден на Съединението (прехвърлен)' },
    { date: '2026-09-22', name: 'Ден на Независимостта на България' },
    { date: '2026-12-24', name: 'Бъдни вечер' },
    { date: '2026-12-25', name: 'Коледа' },
    { date: '2026-12-26', name: 'Коледа' },
    { date: '2026-12-28', name: 'Почивен ден (поради 27 декември в неделя)' },
];

/**
 * Returns holiday information for a given date, or null if it's not a holiday.
 */
export const getHoliday = (date: Date): Holiday | null => {
    // We use local time for holiday detection
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    return HOLIDAYS_2026.find(h => h.date === dateString) || null;
};
