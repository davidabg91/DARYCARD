import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { hasPoint, stopsInPlace, type Stop } from '../../utils/timetable';

/**
 * Няколко спирки в едно село (виж functions/src/stopModel.ts).
 *
 * Първата спирка на селото е собствената му точка. Когато дойде втора, тази
 * точка също става спирка — основната — за да не се премести нищо, което
 * линиите вече ползват: курс, който сочи само селото, спира на основната.
 * Селото пази точката на основната си спирка.
 */

const freeIds = (stops: Stop[], placeId: string) => {
    const taken = new Set(stops.map(s => s.id));
    return () => {
        for (let k = 1; ; k++) {
            const id = `${placeId}--${k}`;
            if (!taken.has(id)) { taken.add(id); return id; }
        }
    };
};

export interface NewStop {
    name: string;
    code?: string;
    lat: number | null;
    lng: number | null;
    locatedBy?: string;
}

/** Добавя спирка в селото. Връща номера на новата спирка. */
export const addStopInPlace = async (stops: Stop[], place: Stop, body: NewStop): Promise<string> => {
    const next = freeIds(stops, place.id);
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const already = stopsInPlace(stops, place.id);
    let main = false;
    if (!already.length) {
        if (hasPoint(place)) {
            batch.set(doc(db, 'stops', next()), {
                name: place.name, code: place.code || '', lat: place.lat, lng: place.lng,
                parentId: place.id, primary: true, locatedBy: place.locatedBy || 'manual', locatedAt: now,
            });
        } else {
            // Село без точка: първата му спирка е основната.
            main = true;
        }
    }
    const id = next();
    batch.set(doc(db, 'stops', id), {
        name: body.name.trim(), code: (body.code || '').trim(), lat: body.lat, lng: body.lng,
        parentId: place.id, primary: main, locatedBy: body.locatedBy || 'manual', locatedAt: now,
    });
    if (main && body.lat !== null && body.lng !== null) batch.update(doc(db, 'stops', place.id), { lat: body.lat, lng: body.lng });
    await batch.commit();
    return id;
};

/** Прави спирката основна за селото — там спират линиите, които сочат само селото. */
export const makeMainStop = async (stops: Stop[], stop: Stop) => {
    if (!stop.parentId) return;
    const batch = writeBatch(db);
    stopsInPlace(stops, stop.parentId).forEach(s => {
        if (s.primary && s.id !== stop.id) batch.update(doc(db, 'stops', s.id), { primary: false });
    });
    batch.update(doc(db, 'stops', stop.id), { primary: true });
    if (hasPoint(stop)) batch.update(doc(db, 'stops', stop.parentId), { lat: stop.lat, lng: stop.lng });
    await batch.commit();
};

/** Мести основната спирка на селото (и точката на селото с нея). */
export const moveMainStop = async (stops: Stop[], place: Stop, lat: number, lng: number, locatedBy: string) => {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const main = stopsInPlace(stops, place.id).find(s => s.primary);
    if (main) batch.update(doc(db, 'stops', main.id), { lat, lng, locatedBy, locatedAt: now });
    batch.update(doc(db, 'stops', place.id), { lat, lng, locatedBy, locatedAt: now });
    await batch.commit();
};

/**
 * Изтрива спирка в село. Ако е основната, основна става следващата и селото
 * взима нейната точка; последната изтрита оставя на селото своята точка.
 */
export const removeStopInPlace = async (stops: Stop[], stop: Stop) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'stops', stop.id));
    if (stop.parentId && stop.primary) {
        const heir = stopsInPlace(stops, stop.parentId).find(s => s.id !== stop.id);
        if (heir) {
            batch.update(doc(db, 'stops', heir.id), { primary: true });
            if (hasPoint(heir)) batch.update(doc(db, 'stops', stop.parentId), { lat: heir.lat, lng: heir.lng });
        }
    }
    await batch.commit();
};
