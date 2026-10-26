// До кой месец картата е валидна без прекъсване.
//
// Пътник, който подновява преди старият абонамент да изтече, държи два платени
// месеца: текущия и следващия. Екранът при сканиране показваше „до края на“
// най-късния платен месец изобщо — значи при плащане за октомври и декември,
// без ноември, казваше „до края на декември“, макар че през ноември картата не
// важи. Брои се само непрекъсната поредица от месеци, започваща от `month`.
//
// Пренесено от TransitFlow (`coveredThrough`), където абонаментите са периоди с
// дати; в DARY абонаментът е календарен месец, затова и сметката е на месеци.

const nextMonth = (month: string): string => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Последният месец от непрекъсната поредица платени месеци от `month` нататък; null, ако `month` не е платен. */
export const paidThroughMonth = (history: Array<{ month?: string }> | undefined, month: string): string | null => {
    const paid = new Set((history || []).map(rh => rh.month).filter((m): m is string => !!m));
    if (!paid.has(month)) return null;
    let end = month;
    // Ограничено от броя записи, значи винаги спира.
    for (let guard = 0; guard < paid.size && paid.has(nextMonth(end)); guard++) end = nextMonth(end);
    return end;
};
