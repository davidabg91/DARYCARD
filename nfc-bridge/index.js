const { NFC } = require('nfc-pcsc');
const { exec } = require('child_process');

const nfc = new NFC();

console.log('================================================');
console.log(' DARY CARD - NFC ЧЕТЕЦ МОСТ (ACR1281U-C1)');
console.log('================================================');
console.log('⏳ Изчакване на свързване с четеца...');

nfc.on('reader', reader => {
    console.log(`✅ Намерен четец: ${reader.reader.name}`);
    console.log(`Моля, доближете карта...\n`);

    reader.on('card', async card => {
        const uid = card.uid.toLowerCase();
        console.log(`💳 Намерена карта! UID: ${uid.toUpperCase()}`);
        
        try {
            // Четене на паметта (NDEF съобщението започва от блок 4 при NTAG/Ultralight)
            // Ще прочетем 64 байта (блокове 4, 8, 12, 16)
            let rawData = Buffer.alloc(0);
            for (let block = 4; block < 20; block += 4) {
                // APDU команда за четене на Mifare/NTAG: FF B0 00 [Block] [Length]
                const cmd = Buffer.from([0xFF, 0xB0, 0x00, block, 0x10]);
                const data = await reader.transmit(cmd, 40);
                
                // Премахваме статус байтовете накрая (обикновено 90 00)
                if (data.length >= 2) {
                    rawData = Buffer.concat([rawData, data.slice(0, data.length - 2)]);
                }
            }

            // Превръщаме в текст
            const text = rawData.toString('ascii');
            
            // Търсим линк. NDEF URI форматът често "скрива" https:// зад един байт (0x04).
            const urlMatch = text.match(/(darycommerce\.com\S+)/) || 
                             text.match(/(davidabg91\.github\.io\S+)/) || 
                             text.match(/(https:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+)/);
            
            if (urlMatch) {
                let url = urlMatch[1];
                
                // Премахваме всякакви невалидни (непечатни) символи в края
                url = url.replace(/[^a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=%].*$/, '');
                
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
                
                console.log(`🔗 Намерен линк: ${url}`);
                
                // Добавяме UID-то към линка
                const separator = url.includes('?') ? '&' : '?';
                const finalUrl = `${url}${separator}uid=${uid.toUpperCase()}`;
                
                console.log(`🚀 Отваряне в браузъра...`);
                
                // Отваряме линка в браузъра по подразбиране
                exec(`start "" "${finalUrl}"`);
                
                // Малка пауза против двойно сканиране
                await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
                console.log('❌ Не е намерен валиден DARY линк в картата.');
            }

        } catch (err) {
            console.error('❌ Грешка при четене на картата. Възможно е да не е форматирана или да е защитена.', err.message);
        }
        console.log(`------------------------------------------------`);
    });

    reader.on('error', err => {
        console.log(`${reader.reader.name} грешка:`, err);
    });
    
    reader.on('end', () => {
        console.log(`Четецът беше изключен.`);
    });
});

nfc.on('error', err => {
    console.log('NFC системна грешка:', err);
});
