export interface RouteMetadata {
  stops: string[];
  priceSingle: string;
  priceCard: string;
  description?: string;
}

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
    priceSingle: "1.80 €",
    priceCard: "36.00 €",
    description: "Ежедневна линия свързваща Плевен с град Тръстеник."
  },
  "Рибен": {
    stops: ["Плевен", "Опанец", "Д.М", "Победа", "Рибен"],
    priceSingle: "2.10 €",
    priceCard: "42.00 €"
  },
  "Долни Дъбник": {
    stops: ["Плевен", "Ясен", "Д. Дъбник"],
    priceSingle: "1.55 €",
    priceCard: "31.00 €"
  },
  "Садовец": {
    stops: ["Плевен", "Ясен", "Крушовица", "Садовец"],
    priceSingle: "2.55 €",
    priceCard: "51.00 €"
  },
  "Славовица": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица"],
    priceSingle: "2.80 €",
    priceCard: "56.00 €"
  },
  "Байкал": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Байкал"],
    priceSingle: "3.10 €",
    priceCard: "62.00 €"
  },
  "Гиген": {
    stops: ["Плевен", "Опанец", "Д.М", "Тръстеник", "Славовица", "Гиген"],
    priceSingle: "3.10 €",
    priceCard: "62.00 €"
  },
  "Бъркач": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица", "Градина", "Петърница", "Бъркач"],
    priceSingle: "2.80 €",
    priceCard: "56.00 €"
  },
  "Горна Митрополия": {
    stops: ["Плевен", "Опанец", "Д.М", "Г.М"],
    priceSingle: "1.55 €",
    priceCard: "31.00 €"
  },
  "Опанец": {
    stops: ["Плевен", "Опанец"],
    priceSingle: "1.05 €",
    priceCard: "21.00 €"
  },
  "Долна Митрополия": {
    stops: ["Плевен", "Опанец", "Д.М"],
    priceSingle: "1.30 €",
    priceCard: "26.00 €"
  },
  "Ясен": {
    stops: ["Плевен", "Ясен"],
    priceSingle: "1.30 €",
    priceCard: "26.00 €"
  },
  "Дисевица": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица"],
    priceSingle: "1.50 €",
    priceCard: "30.00 €"
  },
  "Търнене": {
    stops: ["Плевен", "Ясен", "Търнене"],
    priceSingle: "1.35 €",
    priceCard: "27.00 €"
  },
  "Петърница": {
    stops: ["Плевен", "Ясен", "Търнене", "Дисевица", "Градина", "Петърница"],
    priceSingle: "2.50 €",
    priceCard: "50.00 €"
  },
  "Долни Дъбник - Садовец": {
    stops: ["Д. Дъбник", "Г. Дъбник", "Телиш", "Ракита", "Садовец"],
    priceSingle: "1.50 €",
    priceCard: "30.00 €"
  },
  "Долна Митрополия - Тръстеник": {
    stops: ["Д.М", "Тръстеник"],
    priceSingle: "0.80 €",
    priceCard: "16.00 €"
  },
  "Долна Митрополия - Славовица": {
    stops: ["Д.М", "Тръстеник", "Славовица"],
    priceSingle: "1.80 €",
    priceCard: "36.00 €"
  }
};
