// Municipalities (общини) of Pleven oblast — used for student & pensioner cards.
// Плевен is listed first because it is by far the most common; the rest are
// alphabetical. The card forms auto-fill "Плевен" for the predefined Pleven
// schools and leave the field empty (manual choice) for a custom school.
export const MUNICIPALITIES = [
    "Плевен",
    "Белене",
    "Гулянци",
    "Долна Митрополия",
    "Долни Дъбник",
    "Искър",
    "Кнежа",
    "Левски",
    "Никопол",
    "Пордим",
    "Червен бряг",
];

// Sentinel used by the <select> to switch to a free-text manual entry.
export const MUNICIPALITY_CUSTOM = "custom";

// Default municipality auto-applied for the predefined (Pleven) schools.
export const DEFAULT_MUNICIPALITY = "Плевен";

// Card types that carry an община. Normal & service cards do not.
export const MUNICIPALITY_CARD_TYPES = [
    "Ученическа карта",
    "Пенсионерска карта",
    "Учителска карта",
    "Инвалидна карта",
];

export const needsMunicipality = (cardType?: string) =>
    MUNICIPALITY_CARD_TYPES.includes(cardType || '');
