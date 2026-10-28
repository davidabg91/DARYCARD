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

/**
 * Екран на терминала, който не е пътуване (utils/terminalEvents) — какво е
 * видял шофьорът и защо. `bad` — червено (истински проблем с картата), иначе
 * жълто (проблем с четенето или връзката, картата не е невалидна).
 */
export const TERMINAL_EVENT_INFO: Record<string, { text: string; detail: string; bad: boolean }> = {
    miss: { text: 'Не се прочете', detail: 'Четецът усети картата, но не прочете чипа ѝ, преди да я махнат. Екранът каза „допрете отново“.', bad: false },
    not_read: { text: 'Не се прочете докрай', detail: 'Прочетен е само чипът, без адреса на картата. Екранът каза „картата не се прочете — допрете отново“.', bad: false },
    unknown: { text: 'Непозната карта', detail: 'Адресът е прочетен, но такава карта няма в системата. Екранът каза „НЕПОЗНАТА КАРТА“.', bad: true },
    offline: { text: 'Няма връзка', detail: 'Терминалът нямаше интернет и нямаше запазени данни за картата. Екранът каза „НЯМА ВРЪЗКА“.', bad: false },
    passback: { text: 'Вече сканирана', detail: 'Картата е сканирана преди по-малко от 3 минути — второто допиране не е пътуване.', bad: false },
    cloned: { text: 'Дублирана карта', detail: 'Чипът не е този, който е записан за картата. Екранът показа предупреждение за дублирана карта.', bad: true },
};

/** Как се казва апаратът в отчетите, или празно, ако не се знае. */
export const originDeviceLabel = (o: ScanOrigin): string =>
    o.source === 'web' ? 'Браузър' : (o.deviceName || (o.deviceId ? `апарат ${o.deviceId.slice(0, 6)}` : ''));
