import fs from 'fs';

const filePath = 'D:\\DARY\\src\\pages\\AdminPanel.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF
const normalized = content.replace(/\r\n/g, '\n');

const unusedPeriodLabel = `                            const registerPeriodLabel = reportPeriodType === 'month'
                                ? (reportMonth === 'all'
                                    ? 'ВСИЧКИ МЕСЕЦИ'
                                    : (() => {
                                        const [y, m] = reportMonth.split('-');
                                        const bg = ["ЯНУАРИ", "ФЕВРУАРИ", "МАРТ", "АПРИЛ", "МАЙ", "ЮНИ", "ЮЛИ", "АВГУСТ", "СЕПТЕМВРИ", "ОКТОМВРИ", "НОЕМВРИ", "ДЕКЕМВРИ"];
                                        return \`\${bg[parseInt(m, 10) - 1] || ''} \${y}\`.trim();
                                    })())
                                : reportDate;`;

const unusedMunicipalityLabel = `                            const registerMunicipalityLabel = reportMunicipality === 'all' ? 'ВСИЧКИ' : reportMunicipality;`;

const normalizedPeriod = unusedPeriodLabel.replace(/\r\n/g, '\n');
const normalizedMunicipality = unusedMunicipalityLabel.replace(/\r\n/g, '\n');

let replaced = normalized;
if (replaced.includes(normalizedPeriod)) {
    console.log("Removing registerPeriodLabel...");
    replaced = replaced.replace(normalizedPeriod, '');
} else {
    console.error("Could not find registerPeriodLabel!");
}

if (replaced.includes(normalizedMunicipality)) {
    console.log("Removing registerMunicipalityLabel...");
    replaced = replaced.replace(normalizedMunicipality, '');
} else {
    console.error("Could not find registerMunicipalityLabel!");
}

const restored = replaced.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, restored, 'utf8');
console.log("Unused variables removed successfully!");
