/**
 * Населено място и спирките в него.
 *
 * Пренесените спирки са по една на село („Долна Митрополия“), а автобусът в
 * повечето села спира на две и повече места. Затова една спирка може да има
 * `parentId` — населеното място, към което принадлежи — и тогава е физическа
 * спирка в него; една от тях е `primary`, основната. Населеното място пази
 * точката на основната си спирка, така че всичко, което чете само неговата
 * точка, продължава да работи.
 *
 * Линиите и тарифите сочат населеното място. Където разписанието сочи само
 * него, курсът спира на основната му спирка; на друга спирка в селото — когато
 * в разписанието е сложена самата тя. За Националната точка за достъп
 * населеното място е „станция“ (GTFS location_type 1) с физическите спирки
 * под нея, а тарифната зона е населеното място.
 */

type Data = Record<string, unknown>;

export interface StopIndex {
    stops: Map<string, Data>;
    /** Населено място → физическите спирки в него. */
    childrenOf: Map<string, string[]>;
}

export const indexStops = (stops: Map<string, Data>): StopIndex => {
    const childrenOf = new Map<string, string[]>();
    for (const [id, s] of stops) {
        const parent = typeof s.parentId === "string" ? s.parentId : "";
        if (parent && stops.has(parent)) childrenOf.set(parent, [...(childrenOf.get(parent) || []), id]);
    }
    return { stops, childrenOf };
};

/** Физическата спирка, която линията има предвид: за населено място със спирки — основната. */
export const physicalStop = (id: string, idx: StopIndex): string => {
    const kids = idx.childrenOf.get(id);
    if (!kids?.length) return id;
    return kids.find(k => idx.stops.get(k)?.primary === true) || kids[0];
};

/** Населеното място на спирката — тарифната ѝ зона. */
export const placeOfStop = (id: string, idx: StopIndex): string => {
    const parent = idx.stops.get(id)?.parentId;
    return typeof parent === "string" && idx.stops.has(parent) ? parent : id;
};

/** Има ли спирки под себе си — тогава самото то не е място, на което се спира. */
export const isPlaceWithStops = (id: string, idx: StopIndex) => (idx.childrenOf.get(id)?.length || 0) > 0;
