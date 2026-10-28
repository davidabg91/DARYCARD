/**
 * Откъде е едно сканиране — както го пишат терминалът (utils/scanContext) и
 * сървърът (attributeScanToDevice): на кой апарат, къде, с връзка или без, и
 * какво е видял шофьорът. Показва се от components/ScanOrigin.
 *
 * Старите записи нямат нищо от това — тогава остава само „Валидатор / Шофьор“.
 */
export interface ScanOrigin {
    source?: string;
    browser?: string;
    deviceId?: string;
    deviceName?: string;
    /** "id" — терминалът сам е казал кой е; "time" — познат по часа (старо APK). */
    deviceMatch?: string;
    /** Линията, която автобусът обслужва този ден — по картите, прочетени в него. */
    busRoute?: string;
    place?: string;
    stop?: string;
    stopDistM?: number;
    lat?: number;
    lng?: number;
    acc?: number;
    gpsAgeS?: number;
    /** "local" — проверена от списъка в терминала, без връзка. */
    check?: string;
    /** Какво е показал екранът: "valid", "unpaid", "canceled". */
    shown?: string;
    app?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);

/** Само полетата за произхода от документа на сканирането (или на реда в отчета). */
export const readOrigin = (d: Record<string, unknown>): ScanOrigin => ({
    source: str(d.source), browser: str(d.browser),
    deviceId: str(d.deviceId), deviceName: str(d.deviceName), deviceMatch: str(d.deviceMatch),
    busRoute: str(d.busRoute), place: str(d.place), stop: str(d.stop), stopDistM: num(d.stopDistM),
    lat: num(d.lat), lng: num(d.lng), acc: num(d.acc), gpsAgeS: num(d.gpsAgeS),
    check: str(d.check), shown: str(d.shown), app: str(d.app),
});

/** Как се казва апаратът в отчетите, или празно, ако не се знае. */
export const originDeviceLabel = (o: ScanOrigin): string =>
    o.source === 'web' ? 'Браузър' : (o.deviceName || (o.deviceId ? `апарат ${o.deviceId.slice(0, 6)}` : ''));
