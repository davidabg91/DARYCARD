/**
 * Изпитание на логиката за записване на NFC карти със ЗАМЕСТЕН NDEFReader.
 * Web NFC работи само на истински телефон, затова тук проверяваме държанието,
 * а не самото радио.
 *
 * Пускане (от D:\DARY):
 *   npx tsc --module commonjs --target es2022 --strict --skipLibCheck \
 *     --outDir .tmp-cwtest scripts/test-card-writer.ts src/utils/nfcCardWriter.ts
 *   node .tmp-cwtest/scripts/test-card-writer.js
 */

import {
    createWriteSession,
    estimateNdefUrlBytes,
    NTAG213_USER_BYTES,
    urlFitsNtag213,
    type BatchCard,
    type NdefReaderLike,
    type NdefWriteOptions,
    type WriterState,
} from '../src/utils/nfcCardWriter';

// ---- дребна тестова рамка -------------------------------------------------

let failures = 0;
const assert = (cond: boolean, what: string) => {
    if (cond) {
        console.log(`  ok   ${what}`);
    } else {
        failures += 1;
        console.log(`  ГРЕШ ${what}`);
    }
};
const eq = <T>(actual: T, expected: T, what: string) =>
    assert(actual === expected, `${what} (получено: ${String(actual)}, чакано: ${String(expected)})`);

// ---- заместеният NDEFReader ----------------------------------------------

interface UrlMessage { records: { recordType: string; data: string }[] }

class FakeReader implements NdefReaderLike {
    onreading: ((e: { serialNumber?: string }) => void) | null = null;
    onreadingerror: ((e: unknown) => void) | null = null;

    scanCalls = 0;
    scanSignal: AbortSignal | undefined;
    /** Всеки успешен и неуспешен опит за запис, в реда на случване. */
    attempts: { link: string; overwrite?: boolean; hasSignal: boolean; ok: boolean }[] = [];
    /** Линкове, които чипът да откаже един път, преди да ги приеме. */
    rejectOnce = new Set<string>();

    async scan(options?: { signal?: AbortSignal }): Promise<void> {
        this.scanCalls += 1;
        this.scanSignal = options?.signal;
    }

    async write(message: unknown, options?: NdefWriteOptions): Promise<void> {
        const link = (message as UrlMessage).records[0].data;
        const shouldFail = this.rejectOnce.has(link);
        this.rejectOnce.delete(link);
        this.attempts.push({
            link,
            overwrite: options?.overwrite,
            hasSignal: !!options?.signal,
            ok: !shouldFail,
        });
        if (shouldFail) throw new Error('Tag write failed');
    }

    /** Едно прочитане на карта, както го праща браузърът. */
    fire(serialNumber?: string) {
        this.onreading?.(serialNumber === undefined ? {} : { serialNumber });
    }
}

/** Изчаква микро-задачите, за да приключи започнатият запис. */
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

const BASE = 'https://darycommerce.com/#/client/';
const makeCards = (n: number, startNumber = 1001): BatchCard[] =>
    Array.from({ length: n }, (_, i) => {
        const code = `CODE${String(i + 1).padStart(8, '0')}`;
        return {
            code,
            cardNumber: String(startNumber + i).padStart(10, '0'),
            link: `${BASE}${code}`,
        };
    });

interface Harness {
    reader: FakeReader;
    session: ReturnType<typeof createWriteSession>;
    states: WriterState[];
    feedback: string[];
    last: () => WriterState;
}

const startSession = async (cards: BatchCard[], tune?: (r: FakeReader) => void): Promise<Harness> => {
    const reader = new FakeReader();
    tune?.(reader);
    const states: WriterState[] = [];
    const feedback: string[] = [];
    const session = createWriteSession(cards, {
        createReader: () => reader,
        onState: s => states.push(s),
        feedback: kind => feedback.push(kind),
        now: () => 0,
        // Таймаутът не бива да гърми в теста.
        setTimer: () => 0,
        clearTimer: () => { },
    });
    await session.start();
    return { reader, session, states, feedback, last: () => states[states.length - 1] };
};

// ---- изпитанията ---------------------------------------------------------

const run = async () => {
    console.log('\n1) Линкът се побира в NTAG213 (144 байта)');
    {
        const link = `${BASE}A1B2C3D4E5F6`;
        const bytes = estimateNdefUrlBytes(link);
        console.log(`  линк „${link}" → ${bytes} байта`);
        assert(bytes <= NTAG213_USER_BYTES, `${bytes} ≤ ${NTAG213_USER_BYTES}`);
        // Границата: адрес, който вече не се побира, трябва да бъде отказан.
        const tooLong = `https://example.com/#/client/${'X'.repeat(160)}`;
        assert(!urlFitsNtag213(tooLong), 'прекалено дълъг адрес се отказва');
        const h = await startSession([{ code: 'X', cardNumber: '0000001001', link: tooLong }]);
        eq(h.last().status, 'fatal', 'сесията не тръгва с адрес, който не се побира');
        eq(h.reader.scanCalls, 0, 'NFC дори не се включва');
    }

    console.log('\n2) Една карта, десет прочитания → един запис');
    {
        const cards = makeCards(3);
        const h = await startSession(cards);
        eq(h.reader.scanCalls, 1, 'scan() е извикан веднъж (слушаме, не пишем в цикъл)');
        eq(h.last().current?.cardNumber, '0000001001', 'екранът иска карта № 0000001001');

        for (let i = 0; i < 10; i++) {
            h.reader.fire('04:AA:BB:CC');
            await settle();
        }
        eq(h.reader.attempts.length, 1, 'един опит за запис при десет прочитания');
        eq(h.reader.attempts[0].link, cards[0].link, 'записан е линкът на първата карта');
        eq(h.reader.attempts[0].overwrite, true, 'записът е с overwrite');
        eq(h.reader.attempts[0].hasSignal, true, 'записът има AbortSignal');
        eq(h.last().written.length, 1, 'една записана карта');
        eq(h.feedback.filter(f => f === 'written').length, 1, 'една вибрация/звук');

        console.log('\n3) Втора карта → следващият номер');
        eq(h.last().current?.cardNumber, '0000001002', 'екранът вече иска № 0000001002');
        h.reader.fire('04:11:22:33');
        await settle();
        eq(h.reader.attempts.length, 2, 'втори запис');
        eq(h.reader.attempts[1].link, cards[1].link, 'втората карта получи втория линк');
        eq(h.last().current?.cardNumber, '0000001003', 'следва № 0000001003');

        console.log('\n4) Първата карта, върната върху телефона, се пренебрегва');
        for (let i = 0; i < 5; i++) { h.reader.fire('04:AA:BB:CC'); await settle(); }
        h.reader.fire('04:11:22:33'); await settle();
        eq(h.reader.attempts.length, 2, 'няма нови записи от познати серийни номера');
        eq(h.last().current?.cardNumber, '0000001003', 'номерът стои на място');

        console.log('\n5) Свършването на списъка спира слушането');
        h.reader.fire('04:99:88:77'); await settle();
        eq(h.reader.attempts.length, 3, 'третият запис мина');
        eq(h.last().status, 'done', 'състояние „готово"');
        eq(h.reader.scanSignal?.aborted, true, 'AbortController е спрял слушането');
        h.reader.fire('04:DE:AD:00'); await settle();
        eq(h.reader.attempts.length, 3, 'след края нищо не се пише');
    }

    console.log('\n6) Малки букви / разни разделители = същата карта');
    {
        const h = await startSession(makeCards(2));
        h.reader.fire('04:aa:bb:cc'); await settle();
        h.reader.fire('04:AA:BB:CC'); await settle();
        eq(h.reader.attempts.length, 1, 'серийният номер се сравнява без оглед на регистъра');
    }

    console.log('\n7) Телефон без сериен номер → спираме, не пишем напосоки');
    {
        const h = await startSession(makeCards(5));
        h.reader.fire(undefined); await settle();
        eq(h.reader.attempts.length, 0, 'нито един запис');
        eq(h.last().status, 'fatal', 'състояние „спряно"');
        assert(!!h.last().fatal && h.last().fatal!.includes('сериен номер'), 'обяснението казва защо');
        eq(h.reader.scanSignal?.aborted, true, 'слушането е спряно');
    }

    console.log('\n8) Отказала карта: номерът чака, следващата карта го поема');
    {
        const cards = makeCards(2);
        const h = await startSession(cards, r => r.rejectOnce.add(cards[0].link));
        h.reader.fire('04:BA:D0:01'); await settle();
        eq(h.last().status, 'blocked', 'екранът показва отказа');
        eq(h.last().written.length, 0, 'нищо не е записано');
        eq(h.last().current?.cardNumber, '0000001001', 'номерът НЕ се прескача');
        eq(h.feedback.filter(f => f === 'failed').length, 1, 'кратък сигнал за отказ');

        // Задържаната отказала карта не се опитва в цикъл.
        for (let i = 0; i < 4; i++) { h.reader.fire('04:BA:D0:01'); await settle(); }
        eq(h.reader.attempts.length, 1, 'без повторни опити върху същата карта');

        // „Прескочи картата": оставяме я настрана, № 0000001001 чака следващата.
        h.session.skipCurrent();
        eq(h.last().status, 'listening', 'пак слушаме');
        h.reader.fire('04:BA:D0:01'); await settle();
        eq(h.reader.attempts.length, 1, 'прескочената карта остава прескочена');
        eq(h.last().current?.cardNumber, '0000001001', 'номерът пак чака');
        h.reader.fire('04:60:0D:01'); await settle();
        eq(h.reader.attempts.length, 2, 'нова карта — нов опит');
        eq(h.reader.attempts[1].link, cards[0].link, 'тя получи ПЪРВИЯ линк');
        eq(h.last().written[0].cardNumber, '0000001001', 'номер 0000001001 отиде на нея');
    }

    console.log('\n9) „Опитай пак" със същата карта');
    {
        const cards = makeCards(2);
        const h = await startSession(cards, r => r.rejectOnce.add(cards[0].link));
        h.reader.fire('04:11:11:11'); await settle();
        eq(h.last().status, 'blocked', 'първият опит отказа');

        h.session.retryCurrent();
        eq(h.last().status, 'listening', 'чакаме картата пак');
        h.reader.fire('04:11:11:11'); await settle();
        eq(h.reader.attempts.length, 2, 'втори опит върху същата карта');
        eq(h.last().written.length, 1, 'този път мина');
        eq(h.last().written[0].serial, '04:11:11:11', 'записът е вързан за серийния номер');
        eq(h.last().current?.cardNumber, '0000001002', 'напред към следващия номер');
    }

    console.log('\n10) Затварянето на екрана спира слушането');
    {
        const h = await startSession(makeCards(3));
        h.session.stop();
        eq(h.reader.scanSignal?.aborted, true, 'AbortController е задействан');
        h.reader.fire('04:CA:FE:01'); await settle();
        eq(h.reader.attempts.length, 0, 'след затваряне нищо не се пише');
    }

    console.log(
        failures === 0
            ? '\nВсичко мина.\n'
            : `\n${failures} провалени проверки.\n`
    );
    process.exit(failures === 0 ? 0 : 1);
};

void run();
