import fs from 'fs';
import path from 'path';

const filePath = 'D:\\DARY\\src\\pages\\AdminPanel.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the old mini-header inside the register-print block
const oldHeaderPattern = /<div style=\{\{\s*marginBottom:\s*'14px',\s*lineHeight:\s*1.55\s*\}\}>\s*<div style=\{\{\s*fontSize:\s*'15px',\s*fontWeight:\s*700\s*\}\}>ОБЩИНА:\s*\{registerMunicipalityLabel\}<\/div>\s*<div style=\{\{\s*fontSize:\s*'18px',\s*fontWeight:\s*900,\s*textAlign:\s*'center',\s*margin:\s*'6px 0'\s*\}\}>РЕГИСТЪР НА ИЗДАДЕНИТЕ КАРТИ - \{registerPeriodLabel\}<\/div>\s*<div style=\{\{\s*fontSize:\s*'15px',\s*fontWeight:\s*700\s*\}\}>\{registerCategoryLabel\}:\s*\{registerDistanceLabel\}<\/div>\s*<div style=\{\{\s*fontSize:\s*'14px'\s*\}\}><b>ЛИНИИ:<\/b>\s*\{registerLines\}<\/div>\s*<div style=\{\{\s*fontSize:\s*'14px',\s*marginTop:\s*'8px'\s*\}\}>СЪСТАВИЛ:\s*К\.\s*ВАСИЛЕВА\s*&nbsp;&nbsp;\.{30,}<\/div>\s*<\/div>/g;

// Normalize newlines in pattern search
const oldHeaderString = `<div style={{ marginBottom: '14px', lineHeight: 1.55 }}>
                                                <div style={{ fontSize: '15px', fontWeight: 700 }}>ОБЩИНА: {registerMunicipalityLabel}</div>
                                                <div style={{ fontSize: '18px', fontWeight: 900, textAlign: 'center', margin: '6px 0' }}>РЕГИСТЪР НА ИЗДАДЕНИТЕ КАРТИ - {registerPeriodLabel}</div>
                                                <div style={{ fontSize: '15px', fontWeight: 700 }}>{registerCategoryLabel}: {registerDistanceLabel}</div>
                                                <div style={{ fontSize: '14px' }}><b>ЛИНИИ:</b> {registerLines}</div>
                                                <div style={{ fontSize: '14px', marginTop: '8px' }}>СЪСТАВИЛ: К. ВАСИЛЕВА &nbsp;&nbsp;.................................</div>
                                            </div>`;

// Try direct string replacement by normalizing newlines first
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOldHeader = oldHeaderString.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOldHeader)) {
    console.log("Found old header! Replacing...");
    const replaced = normalizedContent.replace(normalizedOldHeader, '');
    content = replaced;
} else {
    // Try regex as fallback
    console.log("Old header string match failed. Trying regex...");
    const replaced = normalizedContent.replace(oldHeaderPattern, '');
    if (replaced !== normalizedContent) {
        console.log("Regex replacement succeeded!");
        content = replaced;
    } else {
        console.error("Could not find the old header in AdminPanel.tsx!");
    }
}

// 2. Replace the footer in register-print block
const oldFooterString = `<div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>
                                                Общо издадени карти: {filteredReportClients.length}
                                            </div>`;

const newFooterString = `<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '2px solid #333', paddingTop: '10px', fontSize: '13px', color: '#000' }}>
                                                <div><b>СЪСТАВИЛ:</b> К. ВАСИЛЕВА &nbsp;&nbsp;.................................</div>
                                                <div style={{ fontWeight: 700 }}><b>Общо издадени карти:</b> {filteredReportClients.length}</div>
                                            </div>`;

const normalizedOldFooter = oldFooterString.replace(/\r\n/g, '\n');
const normalizedNewFooter = newFooterString.replace(/\r\n/g, '\n');

if (content.includes(normalizedOldFooter)) {
    console.log("Found old footer! Replacing...");
    content = content.replace(normalizedOldFooter, normalizedNewFooter);
} else {
    console.error("Could not find the old footer in AdminPanel.tsx!");
}

// Write the result back, preserving CRLF endings if that was the original format
const finalContent = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("AdminPanel.tsx updated successfully!");
