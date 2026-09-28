import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { CARRIER, formatPrice, type Destination, type TicketLine } from '../data/ticketing';
import { getDeviceId } from './deviceHeartbeat';
import { LINE_WIDTH, printLines, row, rule, type PrintResult } from './terminalPrinter';

/**
 * Билетът, който шофьорът печата от терминала.
 *
 * ПРАВНО (проверено в Наредба № Н-18):
 *  - чл. 26, ал. 1, т. 1–9 изброява реквизитите на касовата бележка. Билетът ги
 *    носи всичките: фирма и адрес, обект („БЕЗ СТАЦИОНАРЕН ОБЕКТ“, какъвто е
 *    автобусът), пореден номер, ЕИК, номер по ЗДДС, кой го издава, услуга и
 *    количество, обща сума и начин на плащане, дата и час.
 *  - чл. 7а, ал. 3 ЗАБРАНЯВА документ, различен от касовия бон, да съдържа
 *    думите „Фискален/Фискална/Фискално/Фискални“ или производни. Затова тази
 *    дума не се изписва никъде — дори за да се отрече.
 *  - чл. 4, т. 3: билет замества касовия бон само ако е отпечатан като ценна
 *    книга с два защитни елемента. Термохартия от принтера не е такава, значи
 *    този билет НЕ замества касов апарат.
 *  - чл. 36, ал. 1: при повреда на касовия апарат продажбите се документират с
 *    касови бележки от кочан.
 */

/** Пореден номер на билет за това устройство. Пази се локално, за да работи и офлайн. */
const SEQ_KEY = 'ticket_seq';

const nextSequence = (): number => {
    let n = 1;
    try {
        n = Number(localStorage.getItem(SEQ_KEY) || '0') + 1;
        localStorage.setItem(SEQ_KEY, String(n));
    } catch { /* частен режим — номерът пак тръгва от 1 */ }
    return n;
};

/** „0007-000123“ — устройството отпред, за да не се повтарят номера между терминалите. */
const formatNumber = (seq: number): string => {
    const id = (getDeviceId() || '0000').replace(/[^A-Za-z0-9]/g, '');
    return `${id.slice(-4).toUpperCase()}-${String(seq).padStart(6, '0')}`;
};

export interface IssuedTicket {
    number: string;
    line: string;
    from: string;
    to: string;
    price: number;
    at: string;
    deviceId: string;
    deviceName: string;
}

export interface TicketOutcome extends PrintResult {
    ticket?: IssuedTicket;
}

const center = (text: string): string => {
    const t = text.slice(0, LINE_WIDTH);
    const pad = Math.max(0, Math.floor((LINE_WIDTH - t.length) / 2));
    return ' '.repeat(pad) + t;
};

/** Разбива дълъг текст на редове по ширината на хартията. */
const wrap = (text: string): string[] => {
    const words = text.split(' ');
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
        if ((cur + (cur ? ' ' : '') + w).length > LINE_WIDTH) {
            if (cur) out.push(cur);
            cur = w;
        } else {
            cur = cur + (cur ? ' ' : '') + w;
        }
    }
    if (cur) out.push(cur);
    return out;
};

export function ticketText(t: IssuedTicket): string[] {
    const d = new Date(t.at);
    const date = d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
    return [
        ...wrap(CARRIER.name).map(center),
        ...wrap(CARRIER.address).map(center),
        center(`ЕИК ${CARRIER.eik}`),
        center(`ЗДДС ${CARRIER.vat}`),
        center('БЕЗ СТАЦИОНАРЕН ОБЕКТ'),
        rule(),
        center('БИЛЕТ ЗА ПРЕВОЗ НА ПЪТНИК'),
        center(`№ ${t.number}`),
        rule(),
        `Линия: ${t.line}`,
        `От:  ${t.from}`,
        `До:  ${t.to}`,
        row(`Дата ${date}`, `Час ${time}`),
        `Издал: ${t.deviceName}`,
        rule(),
        row('Превоз на пътник', '1 бр.'),
        row('СУМА ЗА ПЛАЩАНЕ', formatPrice(t.price)),
        row('Платено', 'В БРОЙ'),
        rule('='),
        center('Пазете билета до края'),
        center('на пътуването.'),
    ];
}

/**
 * Печата билет и го записва. Записът минава през обикновен `addDoc`: когато
 * терминалът е офлайн, Firestore задържа заявката и я праща сама, щом има връзка,
 * така че билетът никога не остава непроследен.
 */
export async function issueTicket(
    line: TicketLine,
    dest: Destination,
    operator: string,
): Promise<TicketOutcome> {
    const seq = nextSequence();
    const id = getDeviceId() || '';
    const ticket: IssuedTicket = {
        number: formatNumber(seq),
        line: line.id,
        from: dest.fromName,
        to: dest.toName,
        price: dest.price,
        at: new Date().toISOString(),
        deviceId: id,
        // чл. 26, ал. 1, т. 6 иска „име ИЛИ номер“ — името на терминала,
        // а ако не се знае — номерът му.
        deviceName: operator || `Терминал ${id.slice(-4)}`,
    };

    const result = await printLines(
        ticketText(ticket).map(text => ({ type: 'TEXT' as const, text: `${text}\n` })),
    );

    if (result.ok) {
        // Само отпечатаните билети се водят продадени.
        addDoc(collection(db, 'tickets'), { ...ticket, printed: true })
            .catch(err => console.error('Билетът не се записа в базата:', err));
        return { ...result, ticket };
    }
    // Непечатаният билет не се брои, но номерът вече е изразходван — така никога
    // два билета не носят един номер, дори принтерът да е заял по средата.
    return result;
}
