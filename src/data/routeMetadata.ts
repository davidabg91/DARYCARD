export const ROUTES = [
  "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
  "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
  "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Търнене", "Градина",
  "Петърница", "Опанец", "Победа", "Подем", "Божурица",
  "Ясен-Дисевица", "Ясен-Долни Дъбник", "Ореховица", "Брегаре", "Крушовене",
  "Гривица", "Згалево", "Пордим", "Одърне", "Каменец", "Вълчитрън", "Катерица", "Борислав",
  "Д. Дъбник - Садовец", "Долна Митрополия - Тръстеник", "Д.Митрополия - Славовица",
  "Долна Митрополия - Горна Митрополия",
  "Пордим - Каменец", "Пордим - Згалево", "Каменец - Одърне", "Пордим - Одърне",
  "Опанец - Долна Митрополия", "Крушовене - Долна Митрополия", "Рибен - Долна Митрополия",
  "Ореховица - Долна Митрополия", "Ореховица - Крушовене", "Опанец - Горна Митрополия",
  "Байкал - Долна Митрополия"
];

export interface RouteMetadata {
  stops: string[];
  priceSingle: string;
  priceCard: string;
  // Per-card-type prices. Set one only when the route's price for that card is
  // not the standard discount off priceCard (student & pensioner -50%,
  // disabled -20%/-25%); cardPrice() falls back to the discount otherwise.
  priceCardStudent?: string;
  priceCardPensioner?: string;
  priceCardTeacher?: string;
  priceCardDisabled?: string;
  description?: string;
}

// Routes covered by the Долна Митрополия contract (Договор РД-12-46/13.04.2022).
// Disabled-card discount for these is 20%; every other route keeps 25%.
export const DM_CONTRACT_ROUTES = new Set<string>([
  "Опанец", "Долна Митрополия", "Победа", "Биволаре", "Рибен", "Тръстеник",
  "Ореховица", "Брегаре", "Крушовене", "Байкал", "Горна Митрополия", "Гиген",
  "Славовица", "Божурица", "Долна Митрополия - Горна Митрополия",
]);

// Discount for a disabled (Инвалидна) card on a given route, as a percentage.
// A route carrying an explicit priceCardDisabled is quoted from that price, so
// report the discount it actually works out to rather than the contract rate.
export const disabledDiscountPct = (route: string): number => {
  const meta = ROUTE_METADATA[route];
  const base = parsePrice(meta?.priceCard);
  const override = parsePrice(meta?.priceCardDisabled);
  if (base && override !== null) return Number((100 - (override / base) * 100).toFixed(2));
  return DM_CONTRACT_ROUTES.has(route) ? 20 : 25;
};

// Multiplier applied to the regular card price for a disabled card (0.80 or 0.75).
export const disabledFactor = (route: string): number =>
  1 - disabledDiscountPct(route) / 100;

// A price cell ("50.00 €") as a number, or null when the route has no such price.
const parsePrice = (value?: string): number | null => {
  if (!value || value === '-' || value === '---') return null;
  const n = parseFloat(value.replace(' €', '').trim());
  return isNaN(n) ? null : n;
};

export const abbreviate = (name: string) => {
  return name
    .replace("Долни Дъбник", "Д. Дъбник")
    .replace("Горни Дъбник", "Г. Дъбник")
    .replace("Долна Митрополия", "Д.М")
    .replace("Горна Митрополия", "Г.М");
};

export const ROUTE_METADATA: Record<string, RouteMetadata> = {
  "Тръстеник": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник"],
    priceSingle: "2.00 €",
    priceCard: "70.00 €"
  },
  "Рибен": {
    stops: ["Плевен", "Опанец", "Д.М", "Победа", "Рибен"],
    priceSingle: "2.00 €",
    priceCard: "70.00 €",
    priceCardDisabled: "52.50 €"
  },
  "Долни Дъбник": {
    stops: ["Плевен", "Ясен", "Д. Дъбник"],
    priceSingle: "2.00 €",
    priceCard: "50.00 €",
    priceCardTeacher: "40.00 €"
  },
  "Ясен-Долни Дъбник": {
    stops: ["Ясен", "Д. Дъбник"],
    priceSingle: "2.00 €",
    priceCard: "45.00 €"
  },
  "Садовец": {
    stops: ["Плевен", "Ясен", "Крушовица", "Садовец"],
    priceSingle: "2.30 €",
    priceCard: "70.00 €"
  },
  "Славовица": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица"],
    priceSingle: "2.00 €",
    priceCard: "70.00 €"
  },
  "Байкал": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Байкал"],
    priceSingle: "3.00 €",
    priceCard: "90.00 €"
  },
  "Гиген": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Гиген"],
    priceSingle: "3.00 €",
    priceCard: "90.00 €"
  },
  "Бъркач": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица", "Градина", "Петърница", "Бъркач"],
    priceSingle: "2.00 €",
    priceCard: "75.00 €",
    description: "Промени: 07:00 и 08:00 (Бъркач); Включен съботен курс в 17:20"
  },
  "Горна Митрополия": {
    stops: ["Плевен", "Опанец", "Д.М", "Г.М"],
    priceSingle: "2.00 €",
    priceCard: "70.00 €"
  },
  "Опанец": {
    stops: ["Плевен", "Опанец"],
    priceSingle: "1.50 €",
    priceCard: "50.00 €"
  },
  "Долна Митрополия": {
    stops: ["Плевен", "Опанец", "Д.М"],
    priceSingle: "2.00 €",
    priceCard: "60.00 €"
  },
  "Ясен": {
    stops: ["Плевен", "Ясен"],
    priceSingle: "1.50 €",
    priceCard: "45.00 €"
  },
  "Дисевица": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица"],
    priceSingle: "1.80 €",
    priceCard: "61.30 €"
  },
  "Търнене": {
    stops: ["Плевен", "Ясен", "Търнене"],
    priceSingle: "1.80 €",
    priceCard: "61.30 €"
  },
  "Петърница": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица", "Градина", "Петърница"],
    priceSingle: "2.00 €",
    priceCard: "75.00 €"
  },
  "Долни Дъбник - Садовец": {
    stops: ["Д. Дъбник", "Г. Дъбник", "Телиш", "Ракита", "Садовец"],
    priceSingle: "1.50 €",
    priceCard: "30.00 €"
  },
  "Долна Митрополия - Тръстеник": {
    stops: ["Д.М", "Тръстеник"],
    priceSingle: "0.80 €",
    priceCard: "50.00 €"
  },
  "Долна Митрополия - Славовица": {
    stops: ["Д.М", "Тръстеник", "Славовица"],
    priceSingle: "1.80 €",
    priceCard: "36.00 €"
  },
  "Долна Митрополия - Горна Митрополия": {
    stops: ["Д.М", "Г.М"],
    priceSingle: "---",
    priceCard: "50.00 €"
  },
  "Биволаре": {
    stops: ["Плевен", "Опанец", "Д.М", "Биволаре"],
    priceSingle: "2.00 €",
    priceCard: "60.00 €",
    priceCardDisabled: "45.00 €"
  },
  "Победа": {
    stops: ["Плевен", "Опанец", "Д.М", "Победа"],
    priceSingle: "2.00 €",
    priceCard: "65.00 €"
  },
  "Крушовица": {
    stops: ["Плевен", "Ясен", "Крушовица"],
    priceSingle: "2.50 €",
    priceCard: "70.00 €"
  },
  "Божурица": {
    stops: ["Плевен", "Опанец", "Д.М", "Победа", "Рибен", "Божурица"],
    priceSingle: "2.00 €",
    priceCard: "70.00 €"
  },
  "Градина": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица", "Градина"],
    priceSingle: "2.00 €",
    priceCard: "75.00 €"
  },
  "Ореховица": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Ореховица"],
    priceSingle: "2.50 €",
    priceCard: "70.00 €"
  },
  "Брегаре": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Брегаре"],
    priceSingle: "2.50 €",
    priceCard: "75.00 €",
    description: "Съвпада с разписанието на Байкал"
  },
  "Крушовене": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Крушовене"],
    priceSingle: "2.50 €",
    priceCard: "80.00 €",
    description: "Съвпада с разписанието на Байкал"
  },
  "Гривица": {
    stops: ["Плевен", "Гривица"],
    priceSingle: "1.50 €",
    priceCard: "-"
  },
  "Згалево": {
    stops: ["Плевен", "Гривица", "Згалево"],
    priceSingle: "2.00 €",
    priceCard: "50.00 €",
    priceCardStudent: "30.00 €",
    priceCardPensioner: "30.00 €"
  },
  "Пордим": {
    stops: ["Плевен", "Гривица", "Згалево", "Пордим"],
    priceSingle: "2.50 €",
    priceCard: "55.00 €",
    priceCardStudent: "36.00 €",
    priceCardPensioner: "36.00 €"
  },
  "Одърне": {
    stops: ["Плевен", "Гривица", "Згалево", "Пордим", "Одърне"],
    priceSingle: "3.00 €",
    priceCard: "65.00 €",
    priceCardStudent: "41.00 €"
  },
  "Каменец": {
    stops: ["Плевен", "Гривица", "Згалево", "Пордим", "Одърне", "Каменец"],
    priceSingle: "3.00 €",
    priceCard: "70.00 €",
    priceCardStudent: "46.00 €"
  },
  "Вълчитрън": {
    stops: ["Плевен", "Гривица", "Згалево", "Пордим", "Вълчитрън"],
    priceSingle: "3.00 €",
    priceCard: "-"
  },
  "Катерица": {
    stops: ["Плевен", "Гривица", "Згалево", "Пордим", "Вълчитрън", "Катерица"],
    priceSingle: "3.00 €",
    priceCard: "-"
  },
  "Борислав": {
    stops: ["Плевен", "Гривица", "Згалево", "Пордим", "Вълчитрън", "Катерица", "Борислав"],
    priceSingle: "3.00 €",
    priceCard: "-",
    description: "Разписание за Понеделник, Сряда и Петък"
  },
  "Пордим - Каменец": {
    stops: ["Пордим", "Одърне", "Каменец"],
    priceSingle: "2.00 €",
    priceCard: "40.00 €",
    priceCardStudent: "28.00 €"
  },
  "Пордим - Згалево": {
    stops: ["Пордим", "Згалево"],
    priceSingle: "---",
    priceCard: "30.00 €",
    priceCardStudent: "18.00 €"
  },
  "Каменец - Одърне": {
    stops: ["Каменец", "Одърне"],
    priceSingle: "---",
    priceCard: "40.00 €"
  },
  "Пордим - Одърне": {
    stops: ["Пордим", "Одърне"],
    priceSingle: "---",
    priceCard: "35.00 €"
  },
  // Community segments from the Долна Митрополия free-transport employee list.
  // No card price (issued as Служебна / manual amount); hidden from the public site.
  "Опанец - Долна Митрополия": {
    stops: ["Опанец", "Д.М"],
    priceSingle: "---",
    priceCard: "-"
  },
  "Крушовене - Долна Митрополия": {
    stops: ["Крушовене", "Д.М"],
    priceSingle: "---",
    priceCard: "-"
  },
  "Рибен - Долна Митрополия": {
    stops: ["Рибен", "Д.М"],
    priceSingle: "---",
    priceCard: "-"
  },
  "Ореховица - Долна Митрополия": {
    stops: ["Ореховица", "Д.М"],
    priceSingle: "---",
    priceCard: "-"
  },
  "Ореховица - Крушовене": {
    stops: ["Ореховица", "Крушовене"],
    priceSingle: "---",
    priceCard: "-"
  },
  "Опанец - Горна Митрополия": {
    stops: ["Опанец", "Г.М"],
    priceSingle: "---",
    priceCard: "-"
  },
  "Байкал - Долна Митрополия": {
    stops: ["Байкал", "Д.М"],
    priceSingle: "---",
    priceCard: "-"
  }
};

// The price of a card on a route, or null when the route has no card price and
// the caller should leave the amount alone. A route may override the price for
// a card type; otherwise student & pensioner are half of priceCard, disabled
// takes the route's discount, and every other card pays the full price.
export const cardPrice = (route: string, cardType?: string): number | null => {
  if (cardType === 'Служебна карта') return 0;
  const meta = ROUTE_METADATA[route];
  if (!meta) return null;

  const override =
    cardType === 'Ученическа карта' ? meta.priceCardStudent :
    cardType === 'Пенсионерска карта' ? meta.priceCardPensioner :
    cardType === 'Учителска карта' ? meta.priceCardTeacher :
    cardType === 'Инвалидна карта' ? meta.priceCardDisabled :
    undefined;
  if (override !== undefined) return parsePrice(override);

  const base = parsePrice(meta.priceCard);
  if (base === null) return null;
  if (cardType === 'Ученическа карта' || cardType === 'Пенсионерска карта') return Number((base / 2).toFixed(2));
  if (cardType === 'Инвалидна карта') return Number((base * disabledFactor(route)).toFixed(2));
  return base;
};
