import fs from 'fs';
import path from 'path';

const cardsTxtPath = 'D:/DARY/DARY PROGRAM EXE/cards.txt';
const outputPath = 'D:/DARY/src/data/cardsMapping.ts';

if (!fs.existsSync(cardsTxtPath)) {
    console.error('File not found:', cardsTxtPath);
    process.exit(1);
}

const content = fs.readFileSync(cardsTxtPath, 'utf-8');
const lines = content.split('\n');
const mapping = {};

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // split by whitespace (spaces or tabs)
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
        const url = parts[0].trim();
        const cardNumber = parts[1].trim();
        
        // Extract client ID from URL (e.g. client/4909C93IL)
        const match = url.match(/client\/([^/?#]+)/);
        if (match) {
            const clientId = match[1];
            mapping[clientId] = cardNumber;
        }
    }
}

const keys = Object.keys(mapping).sort((a, b) => {
    // sort numerically by card number if possible
    const numA = parseInt(mapping[a], 10);
    const numB = parseInt(mapping[b], 10);
    return numA - numB;
});

let tsContent = 'export const CARDS_MAPPING: Record<string, string> = {\n';
for (const key of keys) {
    tsContent += `    "${key}": "${mapping[key]}",\n`;
}
tsContent += '};\n';

fs.writeFileSync(outputPath, tsContent, 'utf-8');
console.log('Successfully generated cardsMapping.ts with', keys.length, 'entries.');
