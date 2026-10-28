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
 *   4. for every stop, takes its biggest group as the place.
 *
 * A stop that has no place yet gets it written straight away when the group is
 * beyond doubt: at least five boardings on at least two days, tight, in the
 * village of that name, and on a line that stops there. Everything else waits
 * for the admin under Разписания → Спирки, because a wrong stop goes to the
 * national feed. A stop already on the map is never moved; if the boardings
 * point elsewhere, it is flagged.
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

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
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
const settlementAt = async (db: admin.firestore.Firestore, lat: number, lng: number, budget: { left: number }) => {
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

export interface LocatorSummary {
    runAt: string;
    boardings: number;
    groups: number;
    applied: number;
    review: number;
    conflicts: number;
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
    const stopByName = new Map([...stops.values()].map(s => [norm(String(s.name || "")), s.id]));
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

    // Per stop: the biggest group is the place.
    const byStop = new Map<string, Named[]>();
    named.forEach(n => { if (n.stopId) byStop.set(n.stopId, [...(byStop.get(n.stopId) || []), n]); });

    const now = new Date().toISOString();
    const batch = db.batch();
    let applied = 0, review = 0, conflicts = 0;
    for (const [stopId, list] of byStop) {
        const stop = stops.get(stopId)!;
        const top = list.sort((a, b) => b.count - a.count)[0];
        const total = list.reduce((s, n) => s + n.count, 0);
        const share = top.count / total;
        const reasons = [...top.reasons];
        if (top.count < AUTO.boardings) reasons.push(`само ${top.count} качвания`);
        if (top.days < AUTO.days) reasons.push("само от един ден");
        if (top.spread > AUTO.spreadM) reasons.push(`разпилени на ${Math.round(top.spread)} м`);
        if (share < AUTO.share) reasons.push(`в селото има ${list.length} места с качвания`);

        const placed = typeof stop.lat === "number" && typeof stop.lng === "number";
        const prev = previous.get(stopId);
        let status: string;
        if (placed) {
            const off = metres({ lat: stop.lat as number, lng: stop.lng as number }, top);
            status = off > CONFLICT_M ? "conflict" : "ok";
            if (status === "conflict") reasons.unshift(`спирката е на ${Math.round(off)} м от мястото на качванията`);
        } else if (prev?.status === "rejected" && typeof prev.lat === "number"
            && metres({ lat: prev.lat as number, lng: prev.lng as number }, top) <= SAME_REJECTED_M) {
            status = "rejected";
        } else if (top.sure && reasons.length === 0) {
            status = "applied";
            batch.update(db.collection("stops").doc(stopId), {
                lat: round6(top.lat), lng: round6(top.lng), locatedBy: "boardings", locatedAt: now,
            });
        } else {
            status = "review";
        }
        if (status === "applied") applied++;
        if (status === "review") review++;
        if (status === "conflict") conflicts++;

        batch.set(db.collection("stop_suggestions").doc(stopId), {
            stopId,
            stopName: String(stop.name || stopId),
            lat: round6(top.lat), lng: round6(top.lng),
            count: top.count, days: top.days, spread: Math.round(top.spread), share: Math.round(share * 100) / 100,
            cards: top.g.members.filter(m => m.kind === "card").length,
            tickets: top.g.members.filter(m => m.kind === "ticket").length,
            settlement: top.settlement ?? "",
            reasons,
            others: list.slice(1, 6).map(n => ({ lat: round6(n.lat), lng: round6(n.lng), count: n.count })),
            status,
            ...(status === "rejected" ? {} : { decidedAt: null, decidedBy: null }),
            updatedAt: now,
        }, { merge: true });
    }

    const summary: LocatorSummary = {
        runAt: now,
        boardings: boardings.length,
        groups: named.length,
        applied, review, conflicts,
        unmatched: named.filter(n => !n.stopId).slice(0, 30)
            .map(n => ({ lat: round6(n.lat), lng: round6(n.lng), count: n.count, settlement: n.settlement ?? "" })),
    };
    batch.set(db.doc("settings/stop_locator"), summary);
    await batch.commit();
    return summary;
};
