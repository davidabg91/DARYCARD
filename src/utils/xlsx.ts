/**
 * Минимален записвач на .xlsx — без библиотека.
 *
 * Защо изобщо: CSV-то се оказа ненадеждно. Excel разпознава UTF-8 по BOM в
 * началото на файла, но когато първият ред е `sep=;` (което пък трябва, за да
 * знае как да раздели колоните), BOM-ът се игнорира и кирилицата излиза като
 * „Р¤РРќРђРќРЎРћР'" — прочетена като Windows-1251. Двете настройки се изключват
 * взаимно, а коя ще спечели зависи от версията и от регионалните настройки.
 *
 * .xlsx няма такова гадаене: това е ZIP с XML вътре, а XML-ът носи
 * `encoding="UTF-8"` записано изрично. Отваря се еднакво навсякъде.
 *
 * Файлът се сглобява без компресия (метод 0, „store"). ZIP форматът го
 * позволява, Excel го приема, а така не ни трябва deflate — цената е по-голям
 * файл, което при няколкостотин реда е без значение.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array): number => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
};

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Екранира петте знака, които не могат да стоят голи в XML. */
const xml = (s: string): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        // Управляващите знаци чупят файла; таб и нов ред са позволени.
        // eslint-disable-next-line no-control-regex -- точно тези знаци се махат
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 1 -> A, 27 -> AA. Excel иска буквена координата на всяка клетка. */
const colName = (index: number): string => {
    let n = index;
    let out = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
};

interface ZipEntry { path: string; data: Uint8Array }

/** Сглобява ZIP без компресия. */
const zip = (entries: ZipEntry[]): Uint8Array => {
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = utf8(entry.path);
        const crc = crc32(entry.data);
        const size = entry.data.length;

        const local = new Uint8Array(30 + nameBytes.length + size);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);   // подпис на локалния запис
        lv.setUint16(4, 20, true);           // нужна версия
        lv.setUint16(6, 0x0800, true);       // флаг: имената са в UTF-8
        lv.setUint16(8, 0, true);            // метод 0 = без компресия
        lv.setUint16(10, 0, true);           // час
        lv.setUint16(12, 0x21, true);        // дата (1980-01-01)
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);
        local.set(entry.data, 30 + nameBytes.length);
        locals.push(local);

        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0x21, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);
        centrals.push(central);

        offset += local.length;
    }

    const centralSize = centrals.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const total = offset + centralSize + end.length;
    const out = new Uint8Array(total);
    let p = 0;
    for (const l of locals) { out.set(l, p); p += l.length; }
    for (const c of centrals) { out.set(c, p); p += c.length; }
    out.set(end, p);
    return out;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/** Стойност на клетка: низ или число. Числата се записват като числа, за да
 *  може колоната със сумите да се сумира в Excel. */
export type CellValue = string | number;

export interface XlsxOptions {
    /** Името на листа. Excel реже над 31 знака и не приема : \ / ? * [ ] */
    sheetName?: string;
    rows: CellValue[][];
}

export const buildXlsx = ({ rows, sheetName = 'Лист1' }: XlsxOptions): Blob => {
    const safeName = sheetName.replace(/[\\/:*?[\]]/g, ' ').slice(0, 31) || 'Лист1';

    const sheetRows = rows.map((row, r) => {
        const cells = row.map((value, c) => {
            const ref = `${colName(c + 1)}${r + 1}`;
            if (typeof value === 'number' && Number.isFinite(value)) {
                return `<c r="${ref}"><v>${value}</v></c>`;
            }
            const text = String(value ?? '');
            if (!text) return `<c r="${ref}"/>`;
            // inlineStr спестява отделния файл sharedStrings.xml.
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
        }).join('');
        return `<row r="${r + 1}">${cells}</row>`;
    }).join('');

    const widest = rows.reduce((max, row) => Math.max(max, row.length), 0);
    // Широчините са приблизителни: най-дългата стойност в колоната, в знаци.
    const widths = Array.from({ length: widest }, (_, c) => {
        const len = rows.reduce((max, row) => Math.max(max, String(row[c] ?? '').length), 0);
        return Math.min(Math.max(len + 2, 8), 50);
    });
    const colsXml = widths.length
        ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
        : '';

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml}<sheetData>${sheetRows}</sheetData></worksheet>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

    const bytes = zip([
        { path: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
        { path: '_rels/.rels', data: utf8(ROOT_RELS) },
        { path: 'xl/workbook.xml', data: utf8(workbook) },
        { path: 'xl/_rels/workbook.xml.rels', data: utf8(WORKBOOK_RELS) },
        { path: 'xl/worksheets/sheet1.xml', data: utf8(sheet) },
    ]);

    return new Blob([bytes as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
};
