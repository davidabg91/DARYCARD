import * as admin from "firebase-admin";

/**
 * Puts the company's stops on the map from where passengers got on.
 *
 * A card is read and a ticket is sold as the passenger boards, and passengers
 * board at stops. Every terminal keeps each boarding with the GPS fix of that
 * moment (`positions/{device}/days/{day}.boardings`, see vehiclePosition.ts),
 * so a place where the terminals keep taking passengers on is a stop.
 *
 * What it does:
 *   1. gathers the boardings of the last two months;
 *   2. puts the ones within 60 m of each other together — one group, one place;
 *   3. names each group by the village it is in (OpenStreetMap, the same map
 *      as the stop editor), and checks it against the tickets sold there: one
 *      end of a ticket is where it was sold (a ticket "Плевен → Бъркач" is
 *      sold in Бъркач too, to someone going to Плевен);
 *   4. for every village, takes its biggest group as its stop when it has
 *      none yet, and offers every other well-used group as a further stop in
 *      the village — most villages have two stops or more (see stopModel.ts).
 *
 * A stop that has no place yet gets it written straight away when the group is
 * beyond doubt: at least five boardings on at least two days, tight, in the
 * village of that name, and on a line that stops there. Everything else waits
 * for the admin under Разписания → Спирки, because a wrong stop goes to the
 * national feed. A stop already on the map is never moved; if nobody boards
 * at it while many do elsewhere, it is flagged. A further stop in a village is
 * made the same way when it is beyond doubt — and the village's first stop
 * becomes a stop under it too, the main one — and offered otherwise.
 *
 * Results: `stop_suggestions/{stopId}` and a summary in `settings/stop_locator`.
 */

type Data = Record<string, unknown>;

interface Boarding {
    lat: number; lng: number; at: number; acc: number | null;
    kind: "card" | "ticket"; line: string; from: string; to: string;
    device: string; day: string;
}

interface Group {
    lat: number; lng: number;
    members: Boarding[];
}

/** Two boardings this close are the same place. */
const SAME_PLACE_M = 60;
/** A fix less sure than this does not place a stop. */
const MAX_ACCURACY_M = 50;
const LOOKBACK_DAYS = 60;
/** OpenStreetMap asks for one lookup a second, and a run is not to take all day. */
const MAX_LOOKUPS = 120;

const AUTO = { boardings: 5, days: 2, spreadM: 40, share: 0.6 };
/** A placed stop further than this from where people board is worth a look. */
const CONFLICT_M = 150;
/** A rejected place stays rejected while the boardings point to the same spot. */
const SAME_REJECTED_M = 40;
/** Boardings this close to a stop the place already has are at that stop — the same distance as a misplaced stop. */
const MATCH_M = CONFLICT_M;
/** Fewer boardings than this somewhere else in a village are not offered as another stop. */
const EXTRA_MIN = 3;

export const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const k = Math.PI / 180;
    const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
    const y = (b.lat - a.lat) * k;
    return Math.sqrt(x * x + y * y) * 6371000;
};

/** The same as normalizeStopName in the app. */
const norm = (name: string) => name.toLowerCase()
    .replace(/^(гр\.|с\.|град|село)\s*/u, "")
    .replace(/[„“"'.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sofiaDay = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** "lat|lng|ms|accuracy|kind|line|from|to" */
const parseBoarding = (raw: string, device: string): Boarding | null => {
    const [lat, lng, at, acc, kind, line = "", from = "", to = ""] = String(raw).split("|");
    const b = {
        lat: Number(lat), lng: Number(lng), at: Number(at), acc: acc === "" ? null : Number(acc),
        kind: kind === "ticket" ? "ticket" as const : "card" as const, line, from, to, device, day: "",
    };
    if (!isFinite(b.lat) || !isFinite(b.lng) || !isFinite(b.at)) return null;
    b.day = sofiaDay(b.at);
    return b;
};

/** The village a point is in, from OpenStreetMap, remembered by ~100 m cell. */
export const settlementAt = async (db: admin.firestore.Firestore, lat: number, lng: number, budget: { left: number }) => {
    const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const ref = db.collection("geo_cache").doc(key);
    const cached = await ref.get();
    if (cached.exists) return String(cached.get("settlement") || "");
    if (budget.left <= 0) return null;
    budget.left--;
    await sleep(1100);
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=bg&lat=${lat}&lon=${lng}`;
        const r = await fetch(url, { headers: { "User-Agent": "DaryCard stop locator (dary.commerce@gmail.com)" } });
        if (!r.ok) return null;
        const j = await r.json() as { address?: Record<string, string> };
        const a = j.address || {};
        const settlement = a.village || a.town || a.city || a.hamlet || a.suburb || "";
        await ref.set({ settlement, at: new Date().toISOString() });
        return settlement;
    } catch (e) {
        console.warn("reverse geocode failed", e);
        return null;
    }
};

/** The street a point is on, for naming a further stop in a village; remembered by ~10 m cell. */
const roadAt = async (db: admin.firestore.Firestore, lat: number, lng: number, budget: { left: number }) => {
    const ref = db.collection("geo_cache").doc(`road_${lat.toFixed(4)}_${lng.toFixed(4)}`);
    const cached = await ref.get();
    if (cached.exists) return String(cached.get("road") || "");
    if (budget.left <= 0) return "";
    budget.left--;
    await sleep(1100);
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=bg&lat=${lat}&lon=${lng}`;
        const r = await fetch(url, { headers: { "User-Agent": "DaryCard stop locator (dary.commerce@gmail.com)" } });
        if (!r.ok) return "";
        const j = await r.json() as { address?: Record<string, string> };
        const a = j.address || {};
        // A road number („3004“, „118“) says nothing to a passenger — only a name.
        const named = (x?: string) => (x && /[A-Za-zА-Яа-я]/.test(x) ? x : "");
        const road = named(a.road) || named(a.pedestrian) || named(a.square) || named(a.amenity) || named(a.neighbourhood) || "";
        await ref.set({ road, at: new Date().toISOString() });
        return road;
    } catch (e) {
        console.warn("road lookup failed", e);
        return "";
    }
};

export interface LocatorSummary {
    runAt: string;
    boardings: number;
    groups: number;
    applied: number;
    review: number;
    conflicts: number;
    /** Further stops found in places that already have one. */
    extra: number;
    /** Stops created in this run (a place's first stop becomes one too). */
    created: number;
    unmatched: Array<{ lat: number; lng: number; count: number; settlement: string }>;
}

export const locateStops = async (): Promise<LocatorSummary> => {
    const db = admin.firestore();
    const cutoff = sofiaDay(Date.now() - LOOKBACK_DAYS * 86400000);

    const [stopSnap, ttSnap, posSnap, prevSnap] = await Promise.all([
        db.collection("stops").get(),
        db.collection("timetables").get(),
        db.collection("positions").get(),
        db.collection("stop_suggestions").get(),
    ]);
    const stops = new Map(stopSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() as Data) } as Data & { id: string }]));
    // Only places: a stop inside a place („Долна Митрополия, ул. …“) is not a village.
    const stopByName = new Map([...stops.values()].filter(s => !s.parentId).map(s => [norm(String(s.name || "")), s.id]));
    const previous = new Map(prevSnap.docs.map(d => [d.id, d.data() as Data]));

    // Which stops each line calls at — a card names its line, a ticket its line.
    const lineStops = new Map<string, Set<string>>();
    ttSnap.docs.forEach(d => {
        const t = d.data() as { name?: string; directions?: Array<{ stopIds?: string[] }> };
        const ids = new Set((t.directions || []).flatMap(x => x.stopIds || []));
        if (t.name) lineStops.set(norm(t.name), ids);
    });

    // The boardings, and for a card the line it was bought for (the device's
    // list of cards read, matched by the moment).
    const boardings: Boarding[] = [];
    for (const p of posSnap.docs) {
        const days = await p.ref.collection("days")
            .where(admin.firestore.FieldPath.documentId(), ">=", cutoff)
            .select("boardings").get();
        const mine: Boarding[] = [];
        days.docs.forEach(d => ((d.get("boardings") as string[]) || []).forEach(raw => {
            const b = parseBoarding(raw, p.id);
            if (b && (b.acc === null || b.acc <= MAX_ACCURACY_M)) mine.push(b);
        }));
        const cardDays = [...new Set(mine.filter(b => b.kind === "card").map(b => new Date(b.at).toISOString().slice(0, 10)))];
        const seen: Array<{ at: number; route: string }> = [];
        for (const day of cardDays) {
            const s = await db.doc(`devices/${p.id}/seen/${day}`).get();
            ((s.get("scans") as Array<{ at?: string; route?: string }>) || [])
                .forEach(x => x.at && seen.push({ at: Date.parse(x.at), route: String(x.route || "") }));
        }
        mine.forEach(b => {
            if (b.kind !== "card" || b.line) return;
            const near = seen.filter(s => Math.abs(s.at - b.at) <= 10000)
                .sort((x, y) => Math.abs(x.at - b.at) - Math.abs(y.at - b.at))[0];
            if (near) b.line = near.route;
        });
        boardings.push(...mine);
    }

    // Places: each boarding joins the nearest group within 60 m, or starts one.
    const groups: Group[] = [];
    boardings.sort((a, b) => a.at - b.at).forEach(b => {
        let best: Group | null = null, bestD = Infinity;
        for (const g of groups) {
            const d = metres(g, b);
            if (d < bestD) { bestD = d; best = g; }
        }
        if (best && bestD <= SAME_PLACE_M) {
            const n = best.members.length;
            best.lat = (best.lat * n + b.lat) / (n + 1);
            best.lng = (best.lng * n + b.lng) / (n + 1);
            best.members.push(b);
        } else {
            groups.push({ lat: b.lat, lng: b.lng, members: [b] });
        }
    });

    // Name each group worth naming.
    const budget = { left: MAX_LOOKUPS };
    interface Named {
        g: Group; lat: number; lng: number; count: number; days: number; spread: number;
        settlement: string | null; stopId: string | null; reasons: string[]; sure: boolean;
    }
    const named: Named[] = [];
    for (const g of groups.filter(x => x.members.length >= 2).sort((a, b) => b.members.length - a.members.length)) {
        const lat = median(g.members.map(m => m.lat)), lng = median(g.members.map(m => m.lng));
        const dists = g.members.map(m => metres({ lat, lng }, m)).sort((a, b) => a - b);
        const spread = dists[Math.floor(dists.length * 0.8)] || 0;
        const days = new Set(g.members.map(m => m.day)).size;
        const settlement = await settlementAt(db, lat, lng, budget);
        const bySettlement = settlement ? stopByName.get(norm(settlement)) || null : null;

        // The tickets sold here: most of them should have this stop at one end.
        const tickets = g.members.filter(m => m.kind === "ticket")
            .map(m => [m.from, m.to].map(x => stopByName.get(norm(x))).filter(Boolean) as string[]);

        const reasons: string[] = [];
        const stopId = bySettlement;
        let sure = !!bySettlement;
        if (stopId && tickets.length >= 2) {
            const agree = tickets.filter(ends => ends.includes(stopId)).length;
            if (agree / tickets.length < 0.5) {
                sure = false;
                reasons.push(`${tickets.length - agree} от ${tickets.length} билета оттук не са за или от тази спирка`);
            }
        }
        // A line that does not call at this stop means a passenger tapped late.
        const lines = new Set(g.members.flatMap(m => m.line.split(",").map(x => norm(x)).filter(Boolean)));
        if (stopId && lines.size) {
            const calls = [...lines].some(l => lineStops.get(l)?.has(stopId!));
            if (!calls) { sure = false; reasons.push("линиите на тези качвания не спират там по разписание"); }
        }
        named.push({ g, lat, lng, count: g.members.length, days, spread, settlement, stopId, reasons, sure });
    }

    // ── Per place: its stops, and where else passengers board ────────────────
    //
    // Most villages have two stops or more. A group of boardings next to a stop
    // the place already has is that stop; one away from all of them is another
    // stop in the village. The first stop of a place is the place's own point;
    // from the second on, each is a stop of its own under the place (`parentId`,
    // see stopModel.ts), and the place keeps the point of its main one.
    const byPlace = new Map<string, Named[]>();
    named.forEach(n => { if (n.stopId) byPlace.set(n.stopId, [...(byPlace.get(n.stopId) || []), n]); });

    const childrenOf = new Map<string, Array<Data & { id: string }>>();
    for (const s of stops.values()) {
        const parent = typeof s.parentId === "string" ? s.parentId : "";
        if (parent && stops.has(parent)) childrenOf.set(parent, [...(childrenOf.get(parent) || []), s]);
    }
    const hasPt = (s: Data | undefined) => !!s && typeof s.lat === "number" && typeof s.lng === "number";
    const takenIds = new Set(stops.keys());
    const nextChildId = (placeId: string) => {
        for (let k = 1; ; k++) {
            const id = `${placeId}--${k}`;
            if (!takenIds.has(id)) { takenIds.add(id); return id; }
        }
    };
    const previousExtras = [...previous.entries()]
        .filter(([, p]) => p.kind === "extra")
        .map(([id, p]) => ({ id, ...p }) as Data & { id: string });
    const keptExtras = new Set<string>();

    const now = new Date().toISOString();
    const batch = db.batch();
    let applied = 0, review = 0, conflicts = 0, extra = 0, created = 0;

    for (const [placeId, list] of byPlace) {
        const place = stops.get(placeId)!;
        list.sort((a, b) => b.count - a.count);
        const total = list.reduce((s, n) => s + n.count, 0);
        const placeName = String(place.name || placeId);
        const kids = (childrenOf.get(placeId) || []).filter(hasPt);

        // The stops the place already has, and how many board at each.
        const known = kids.length
            ? kids.map(k => ({ id: k.id, lat: k.lat as number, lng: k.lng as number, primary: k.primary === true }))
            : hasPt(place) ? [{ id: placeId, lat: place.lat as number, lng: place.lng as number, primary: true }] : [];
        const boardedAt = new Map<string, number>();
        const free: Named[] = [];
        for (const n of list) {
            const near = known.map(k => ({ k, d: metres(k, n) })).sort((a, b) => a.d - b.d)[0];
            if (near && near.d <= MATCH_M) boardedAt.set(near.k.id, (boardedAt.get(near.k.id) || 0) + n.count);
            else free.push(n);
        }

        // ── The place's own point (its main stop) ──
        const prev = previous.get(placeId);
        const main = known.find(k => k.primary) || known[0];
        let mainTarget: Named | null = null;
        let status: string;
        const reasons: string[] = [];
        if (!main) {
            // No point yet: the biggest place of boarding is it.
            mainTarget = free[0] || null;
            if (!mainTarget) continue;
            reasons.push(...mainTarget.reasons);
            if (mainTarget.count < AUTO.boardings) reasons.push(`само ${mainTarget.count} качвания`);
            if (mainTarget.days < AUTO.days) reasons.push("само от един ден");
            if (mainTarget.spread > AUTO.spreadM) reasons.push(`разпилени на ${Math.round(mainTarget.spread)} м`);
            if (prev?.status === "rejected" && typeof prev.lat === "number"
                && metres({ lat: prev.lat as number, lng: prev.lng as number }, mainTarget) <= SAME_REJECTED_M) {
                status = "rejected";
            } else if (mainTarget.sure && reasons.length === 0) {
                status = "applied";
                batch.update(db.collection("stops").doc(placeId), {
                    lat: round6(mainTarget.lat), lng: round6(mainTarget.lng), locatedBy: "boardings", locatedAt: now,
                });
                // The extras below may need it as their place's point.
                place.lat = round6(mainTarget.lat);
                place.lng = round6(mainTarget.lng);
                known.push({ id: placeId, lat: mainTarget.lat, lng: mainTarget.lng, primary: true });
            } else {
                status = "review";
            }
        } else if (!list.some(n => metres(main, n) <= CONFLICT_M) && list[0].count >= AUTO.boardings) {
            // Nobody boards at the main stop, and many do elsewhere: probably misplaced.
            mainTarget = list[0];
            status = "conflict";
            reasons.push(`на спирката никой не се качва, а на ${Math.round(metres(main, mainTarget))} м — ${mainTarget.count} качвания`);
        } else {
            status = "ok";
        }
        if (status === "applied") applied++;
        if (status === "review") review++;
        if (status === "conflict") conflicts++;
        const shown = mainTarget || list[0];
        batch.set(db.collection("stop_suggestions").doc(placeId), {
            kind: "main",
            stopId: placeId,
            placeId,
            placeName,
            stopName: placeName,
            lat: round6(shown.lat), lng: round6(shown.lng),
            count: mainTarget ? mainTarget.count : (boardedAt.get(main!.id) || 0),
            days: shown.days, spread: Math.round(shown.spread), share: Math.round((shown.count / total) * 100) / 100,
            cards: shown.g.members.filter(m => m.kind === "card").length,
            tickets: shown.g.members.filter(m => m.kind === "ticket").length,
            settlement: shown.settlement ?? "",
            reasons,
            stopsInPlace: known.length,
            others: free.filter(n => n !== mainTarget).slice(0, 6).map(n => ({ lat: round6(n.lat), lng: round6(n.lng), count: n.count })),
            status,
            ...(status === "rejected" ? {} : { decidedAt: null, decidedBy: null }),
            updatedAt: now,
        }, { merge: true });

        // ── Further stops in the place ──
        const placed = known.length > 0;
        // Names: „Село, улица“; with no street „Село (2)“; two on one street
        // „Село, улица (2)“. The main stop, made from the village's own point
        // when a second one comes, is named first and keeps the bare village
        // name when it has no street.
        const usedNames = new Set((childrenOf.get(placeId) || []).map(k => String(k.name || "")));
        const uniqueName = (road: string, bare: boolean) => {
            const base = road ? `${placeName}, ${road}` : bare ? placeName : `${placeName} (2)`;
            let name = base;
            for (let k = 2; usedNames.has(name); k++) name = road || bare ? `${base} (${k})` : `${placeName} (${k})`;
            usedNames.add(name);
            return name;
        };
        let mainName = "";
        const needsMain = !kids.length && hasPt(place) && free.some(n => n !== mainTarget && n.count >= EXTRA_MIN);
        if (needsMain) mainName = uniqueName(await roadAt(db, place.lat as number, place.lng as number, budget), true);
        for (const n of free) {
            if (n === mainTarget || n.count < EXTRA_MIN) continue;
            const before = previousExtras.find(p => p.placeId === placeId && typeof p.lat === "number"
                && metres({ lat: p.lat as number, lng: p.lng as number }, n) <= SAME_REJECTED_M);
            const id = before?.id || `${placeId}__${n.lat.toFixed(4)}_${n.lng.toFixed(4)}`;
            keptExtras.add(id);
            if (before?.status === "applied" || before?.status === "accepted") continue;   // already a stop

            const why = [...n.reasons];
            if (n.count < AUTO.boardings) why.push(`само ${n.count} качвания`);
            if (n.days < AUTO.days) why.push("само от един ден");
            if (n.spread > AUTO.spreadM) why.push(`разпилени на ${Math.round(n.spread)} м`);
            if (!placed) why.push("селото още няма основна спирка");
            const name = uniqueName(await roadAt(db, n.lat, n.lng, budget), false);

            let extraStatus: string;
            let childId = "";
            if (before?.status === "rejected") {
                extraStatus = "rejected";
            } else if (n.sure && why.length === 0) {
                // Beyond doubt: the place gets a stop of its own here. Its first
                // stop becomes a stop too, the main one, so the place keeps it.
                if (!kids.length && hasPt(place)) {
                    const mainId = nextChildId(placeId);
                    batch.set(db.collection("stops").doc(mainId), {
                        name: mainName || placeName,
                        code: String(place.code || ""),
                        lat: place.lat, lng: place.lng, parentId: placeId, primary: true,
                        locatedBy: String(place.locatedBy || "manual"), locatedAt: now,
                    });
                    kids.push({ id: mainId, lat: place.lat, lng: place.lng, primary: true } as Data & { id: string });
                    created++;
                }
                childId = nextChildId(placeId);
                batch.set(db.collection("stops").doc(childId), {
                    name, code: "", lat: round6(n.lat), lng: round6(n.lng), parentId: placeId, primary: false,
                    locatedBy: "boardings", locatedAt: now,
                });
                kids.push({ id: childId, lat: round6(n.lat), lng: round6(n.lng), primary: false } as Data & { id: string });
                known.push({ id: childId, lat: n.lat, lng: n.lng, primary: false });
                extraStatus = "applied";
                created++;
            } else {
                extraStatus = "review";
            }
            extra++;
            batch.set(db.collection("stop_suggestions").doc(id), {
                kind: "extra",
                placeId,
                placeName,
                stopId: childId,
                stopName: name,
                name,
                lat: round6(n.lat), lng: round6(n.lng),
                count: n.count, days: n.days, spread: Math.round(n.spread), share: Math.round((n.count / total) * 100) / 100,
                cards: n.g.members.filter(m => m.kind === "card").length,
                tickets: n.g.members.filter(m => m.kind === "ticket").length,
                settlement: n.settlement ?? "",
                reasons: why,
                others: known.map(k => ({ lat: round6(k.lat), lng: round6(k.lng), count: boardedAt.get(k.id) || 0 })),
                status: extraStatus,
                ...(extraStatus === "rejected" ? {} : { decidedAt: null, decidedBy: null }),
                updatedAt: now,
            }, { merge: true });
        }
    }

    // Suggestions for further stops that this run no longer sees (still waiting
    // for a decision) are gone: the boardings moved or were too few.
    previousExtras
        .filter(p => p.status === "review" && !keptExtras.has(p.id))
        .forEach(p => batch.delete(db.collection("stop_suggestions").doc(p.id)));

    const summary: LocatorSummary = {
        runAt: now,
        boardings: boardings.length,
        groups: named.length,
        applied, review, conflicts, extra, created,
        unmatched: named.filter(n => !n.stopId).slice(0, 30)
            .map(n => ({ lat: round6(n.lat), lng: round6(n.lng), count: n.count, settlement: n.settlement ?? "" })),
    };
    batch.set(db.doc("settings/stop_locator"), summary);
    await batch.commit();
    return summary;
};
