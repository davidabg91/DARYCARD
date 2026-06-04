// Schools for student cards, mapped to the община they belong to. The card
// forms read SCHOOLS for the dropdown and use SCHOOL_MUNICIPALITY to auto-fill
// the matching municipality when a predefined school is chosen. Schools outside
// Плевен (Долна Митрополия, Долни Дъбник, …) therefore set the correct община
// automatically instead of defaulting to Плевен.
//
// NOTE: keep the existing Плевен school strings byte-for-byte identical to the
// previous inline list so already-saved client records still match a dropdown
// option. The place suffix on some names (e.g. ЯСЕН / Д. ДЪБНИК) disambiguates
// the two "Св. Св. Кирил и Методий" schools.
export const SCHOOL_MUNICIPALITY: Record<string, string> = {
    // --- Община Плевен ---
    "ДФСГ": "Плевен",
    "МГ ГЕО МИЛЕВ": "Плевен",
    "МЕД. УНИВЕРСИТЕТ": "Плевен",
    "ОУ „Д-Р ПЕТЪР БЕРОН“": "Плевен",
    "ОУ „ЦВ СПАСОВ“": "Плевен",
    "ПГ ЕХТ": "Плевен",
    "ПГ ЛВ": "Плевен",
    "ПГ МЕТ": "Плевен",
    "ПГ ОТ „ХР БОЯДЖИЕВ“": "Плевен",
    "ПГ ПССТ": "Плевен",
    "ПГ ПЧЕ": "Плевен",
    "ПГ САГ": "Плевен",
    "ПГ Т „ЦВ ЛАЗАРОВ“": "Плевен",
    "ПГ ТУРИЗЪМ": "Плевен",
    "ПГ ХВТ": "Плевен",
    "СУ „АН. ДИМИТРОВА“": "Плевен",
    "СУ „Г. БЕНКОВСКИ“": "Плевен",
    "СУ „ИВ. ВАЗОВ“": "Плевен",
    "СУ „СТ. ЗАИМОВ“": "Плевен",
    "ОУ „СВ. СВ. КИРИЛ И МЕТОДИЙ“ ЯСЕН": "Плевен",
    "СУ „ХРИСТО СМИРНЕНСКИ“": "Плевен",
    "ПЕДАГОГИЧЕСКИ КОЛЕЖ": "Плевен",

    // --- Община Долна Митрополия ---
    "СУ „ВАСИЛ АПРИЛОВ“ Д. МИТРОПОЛИЯ": "Долна Митрополия",
    "СУ „ЕВЛОГИ ГЕОРГИЕВ“ ТРЪСТЕНИК": "Долна Митрополия",
    "ВВВУ Д. МИТРОПОЛИЯ": "Долна Митрополия",

    // --- Община Долни Дъбник ---
    "НУ „СВ. СВ. КИРИЛ И МЕТОДИЙ“ Д. ДЪБНИК": "Долни Дъбник",
    "СУ „ХРИСТО БОТЕВ“ Д. ДЪБНИК": "Долни Дъбник",
};

// Alphabetical (Bulgarian) school list for the dropdowns.
export const SCHOOLS = Object.keys(SCHOOL_MUNICIPALITY).sort((a, b) => a.localeCompare(b, 'bg'));
