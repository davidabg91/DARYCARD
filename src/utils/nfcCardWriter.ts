// Записване на партида NFC карти от телефон (Web NFC, Chrome на Android).
//
// Тук е САМО логиката, без React — за да може да се изпита с фалшив NDEFReader
// (виж scripts/test-card-writer.ts).
//
// ЗАЩО НЕ ПИШЕМ В ЦИКЪЛ (грешката, хваната веднъж):
// write() приключва, докато картата ВСЕ ОЩЕ е на телефона, а няма събитие
// „картата е махната". Ако веднага след това въоръжим следващия запис, той пада
// върху същата карта — пет-шест адреса за секунда.
// Затова слушаме с scan() и пазим Set със серийните номера (event.serialNumber)
// на вече обработените карти. Познат сериен номер се пренебрегва, колкото и дълго
// да се държи картата; нов сериен номер = нова карта, чак тогава пишем напред.

/** NTAG213 — потребителска памет в байтове. */
export const NTAG213_USER_BYTES = 144;

/**
 * Колко от чипа изчитат четците ни: и myPOS терминалът, и офисният четец
 * стигат до страница 35, тоест 128 байта. Телефонът чете целия чип, но карта,
 * която само телефонът може да прочете, е безполезна в автобуса — затова границата
 * е по-малкото от двете. (До 2026-09-11 терминалът четеше само 48 байта и тихо
 * режеше по-дългите линкове.)
 */
export const READER_WINDOW_BYTES = 128;

/** Действащата граница за един линк. */
export const MAX_LINK_BYTES = Math.min(NTAG213_USER_BYTES, READER_WINDOW_BYTES);

/** Колко чакаме един запис, преди да го обявим за неуспешен. */
export const WRITE_TIMEOUT_MS = 10000;

export interface BatchCard {
    /** 12-те шестнайсетични знака в линка (id-то на бъдещия клиент). */
    code: string;
    /** Физическият номер, отпечатан на картата — „0000001001". */
    cardNumber: string;
    /** Целият линк, който отива в чипа. */
    link: string;
}

export type WriterStatus =
    | 'idle'        // още не сме започнали
    | 'listening'   // чакаме допиране на нова карта
    | 'writing'     // в момента пишем
    | 'blocked'     // картата отказа — чака решение
    | 'done'        // партидата свърши
    | 'fatal';      // не можем да продължим (напр. телефонът не дава сериен номер)

export interface WrittenCard extends BatchCard {
    serial: string;
    at: number;
}

export interface WriterState {
    status: WriterStatus;
    /** Индексът на картата, която чака запис. */
    index: number;
    total: number;
    /** Картата, която трябва да сложа на телефона СЕГА (undefined, ако сме готови). */
    current?: BatchCard;
    written: WrittenCard[];
    /** Последно записаната карта — за зелената лента „готово". */
    lastWritten?: WrittenCard;
    /** Карта, която отказа записа: чака „опитай пак" или друга карта. */
    failure?: { card: BatchCard; serial: string; message: string };
    /** Причина да спрем окончателно. */
    fatal?: string;
}

/** Минималната част от Web NFC, която ползваме — за да е заменима в тестовете. */
export interface NdefWriteOptions {
    overwrite?: boolean;
    signal?: AbortSignal;
}
export interface NdefReadingEvent {
    serialNumber?: string;
}
export interface NdefReaderLike {
    scan(options?: { signal?: AbortSignal }): Promise<void>;
    write(message: unknown, options?: NdefWriteOptions): Promise<void>;
    onreading: ((event: NdefReadingEvent) => void) | null;
    onreadingerror: ((event: unknown) => void) | null;
}

export interface WriteSessionDeps {
    /** Създава NDEFReader (или фалшив в тест). Вика се веднъж на сесия. */
    createReader: () => NdefReaderLike;
    /** Извиква се при всяка промяна на състоянието. */
    onState: (state: WriterState) => void;
    /** Вибрация + звук. */
    feedback?: (kind: 'written' | 'failed') => void;
    now?: () => number;
    /** Заменим таймер — тестът подава свой, за да не чака 10 секунди. */
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

export interface WriteSession {
    start: () => Promise<void>;
    /** Спира слушането (AbortController) — при затваряне на екрана. */
    stop: () => void;
    /**
     * Отказалата карта се „забравя", за да може да се допре пак.
     * Не пишем направо: всеки запис трябва да е вързан за сериен номер, който
     * сме видели, иначе следващото допиране би минало за нова карта.
     */
    retryCurrent: () => void;
    /** Оставяме отказалата карта настрана — същият номер чака следващата карта. */
    skipCurrent: () => void;
    getState: () => WriterState;
}

/**
 * Груба, но безопасна оценка на NDEF съобщението с един URL запис:
 * заглавка (1) + дължина на типа (1) + дължина на съдържанието (1) + тип „U" (1)
 * + код на съкращението (1) + самият адрес; после TLV обвивката на чипа
 * (0x03 + дължина) и затварящият 0xFE.
 * Не разчитаме на съкращаване на „https://" — по-добре да преценим в повече.
 */
export const estimateNdefUrlBytes = (url: string): number => {
    const urlBytes = new TextEncoder().encode(url).length;
    const record = 4 + 1 + urlBytes;
    const lengthField = record < 255 ? 1 : 3;      // TLV дължина: кратка или 3-байтова
    return 1 + lengthField + record + 1;
};

export const urlFitsCard = (url: string): boolean =>
    estimateNdefUrlBytes(url) <= MAX_LINK_BYTES;

/** Web NFC го няма в стандартните типове на TypeScript. */
export type NdefReaderCtor = new () => NdefReaderLike;

export const getNdefReaderCtor = (): NdefReaderCtor | null => {
    if (typeof window === 'undefined') return null;
    const ctor = (window as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader;
    return typeof ctor === 'function' ? ctor : null;
};

/** Записвачът има смисъл само там, където Web NFC съществува (Chrome на Android). */
export const isWebNfcAvailable = (): boolean => getNdefReaderCtor() !== null;

export const createWriteSession = (cards: BatchCard[], deps: WriteSessionDeps): WriteSession => {
    const now = deps.now ?? (() => Date.now());
    const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

    const seen = new Set<string>();          // серийните номера на вече обработените карти
    const written: WrittenCard[] = [];
    const controller = new AbortController();

    let reader: NdefReaderLike | null = null;
    let index = 0;
    let busy = false;
    let stopped = false;
    let status: WriterStatus = 'idle';
    let lastWritten: WrittenCard | undefined;
    let failure: WriterState['failure'];
    let fatal: string | undefined;

    const getState = (): WriterState => ({
        status,
        index,
        total: cards.length,
        current: cards[index],
        written: [...written],
        lastWritten,
        failure,
        fatal,
    });

    const emit = () => deps.onState(getState());

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (reader) {
            reader.onreading = null;
            reader.onreadingerror = null;
        }
        controller.abort();
    };

    const finish = () => {
        status = 'done';
        stop();
        emit();
    };

    const die = (message: string) => {
        fatal = message;
        status = 'fatal';
        stop();
        emit();
    };

    const attemptWrite = async (card: BatchCard, serial: string) => {
        busy = true;
        failure = undefined;
        status = 'writing';
        emit();

        // Собствен AbortController за записа: така таймаутът убива само него,
        // а общото слушане остава живо. Общият abort също го събаря.
        const writeAbort = new AbortController();
        const onOuterAbort = () => writeAbort.abort();
        controller.signal.addEventListener('abort', onOuterAbort);
        let timedOut = false;
        const timer = setTimer(() => { timedOut = true; writeAbort.abort(); }, WRITE_TIMEOUT_MS);

        try {
            await reader!.write(
                { records: [{ recordType: 'url', data: card.link }] },
                { overwrite: true, signal: writeAbort.signal }
            );
            const record: WrittenCard = { ...card, serial, at: now() };
            written.push(record);
            lastWritten = record;
            index += 1;
            deps.feedback?.('written');
            if (index >= cards.length) { finish(); return; }
            status = 'listening';
            emit();
        } catch (err) {
            // Индексът НЕ се мести — номерът чака карта, която го приема.
            // Серийният номер остава в seen, за да не се пише в цикъл, докато
            // същата карта е още на телефона.
            const message = timedOut
                ? 'Картата не отговори навреме (10 сек.).'
                : (err instanceof Error && err.message ? err.message : 'Записът беше отказан.');
            failure = { card, serial, message };
            if (!stopped) {
                // При затваряне на екрана записът също пада — тогава не звъним.
                status = 'blocked';
                deps.feedback?.('failed');
                emit();
            }
        } finally {
            clearTimer(timer);
            controller.signal.removeEventListener('abort', onOuterAbort);
            busy = false;
        }
    };

    const handleReading = (event: NdefReadingEvent) => {
        if (stopped || index >= cards.length) return;

        const serial = (event?.serialNumber ?? '').trim().toUpperCase();
        if (!serial) {
            // Без сериен номер няма как да различим нова карта от същата карта.
            // По-добре да спрем, отколкото да пишем напосоки.
            die('Телефонът не съобщава сериен номер на картата, така че не мога да позная кога слагаш нова. Спрях, за да не запиша няколко линка на една карта.');
            return;
        }
        if (busy) return;             // пишем — всичко останало чака
        if (seen.has(serial)) return; // същата карта, още е на телефона

        seen.add(serial);
        void attemptWrite(cards[index], serial);
    };

    const start = async () => {
        if (!cards.length) { finish(); return; }

        const tooBig = cards.find(c => !urlFitsCard(c.link));
        if (tooBig) {
            die(`Линкът е ${estimateNdefUrlBytes(tooBig.link)} байта, а четците изчитат ${MAX_LINK_BYTES}. Терминалът ще чете отрязан код.`);
            return;
        }

        reader = deps.createReader();
        reader.onreading = handleReading;
        reader.onreadingerror = () => {
            if (stopped || busy || index >= cards.length) return;
            failure = { card: cards[index], serial: '', message: 'Картата не се прочете. Допри я пак, по-плътно.' };
            status = 'blocked';
            deps.feedback?.('failed');
            emit();
        };

        try {
            await reader.scan({ signal: controller.signal });
        } catch (err) {
            die(err instanceof Error && err.message
                ? `Не успях да включа NFC: ${err.message}`
                : 'Не успях да включа NFC.');
            return;
        }
        if (stopped) return;
        status = 'listening';
        emit();
    };

    const retryCurrent = () => {
        if (stopped || !failure) return;
        if (failure.serial) seen.delete(failure.serial);
        failure = undefined;
        status = 'listening';
        emit();
    };

    const skipCurrent = () => {
        if (stopped || !failure) return;
        // Серийният номер остава в seen — тази физическа карта е настрана.
        failure = undefined;
        status = 'listening';
        emit();
    };

    return { start, stop, retryCurrent, skipCurrent, getState };
};
