import sys
import time
import re
import webbrowser
from smartcard.System import readers
from smartcard.scard import *
from smartcard.CardMonitoring import CardMonitor, CardObserver
from smartcard.util import toHexString

class DaryCardObserver(CardObserver):
    def __init__(self):
        super().__init__()
        self.last_uid = None
        self.last_time = 0

    def update(self, observable, actions):
        (addedcards, removedcards) = actions
        for card in addedcards:
            try:
                connection = card.createConnection()
                connection.connect()

                # Четене на UID чрез стандартна PC/SC APDU команда
                uid_data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
                if sw1 == 0x90 and sw2 == 0x00:
                    uid_hex = toHexString(uid_data).replace(' ', '').upper()
                    
                    # Проверка против двойно сканиране (debounce 2 секунди)
                    current_time = time.time()
                    if uid_hex == self.last_uid and (current_time - self.last_time) < 2:
                        continue
                        
                    self.last_uid = uid_hex
                    self.last_time = current_time
                    
                    print(f"\n💳 Намерена карта! UID: {uid_hex}")
                    
                    # Четене на паметта (NDEF). Започваме от блок 4. Четем 16 блока по 4 байта = 64 байта.
                    raw_bytes = bytearray()
                    for block in range(4, 20):
                        # Команда за четене на Mifare/NTAG: FF B0 00 [Block] 04
                        data, s1, s2 = connection.transmit([0xFF, 0xB0, 0x00, block, 0x04])
                        if s1 == 0x90 and s2 == 0x00:
                            raw_bytes.extend(data)
                        else:
                            break
                    
                    if len(raw_bytes) > 0:
                        text = raw_bytes.decode('ascii', errors='ignore')
                        
                        # Търсим домейна на DaryCommerce / GitHub
                        match = re.search(r'(darycommerce\.com\S+|davidabg91\.github\.io\S+|https://[a-zA-Z0-9-._~:/?#\[\]@!$&\'()*+,;=]+)', text)
                        if match:
                            url = match.group(1)
                            # Изчистване на невалидни символи накрая
                            url = re.sub(r'[^a-zA-Z0-9-._~:/?#\[\]@!$&\'()*+,;=%].*$', '', url)
                            
                            if not url.startswith('http'):
                                url = 'https://' + url
                                
                            print(f"🔗 Намерен линк: {url}")
                            
                            # Прикачваме хардуерния UID като параметър към линка
                            separator = '&' if '?' in url else '?'
                            final_url = f"{url}{separator}uid={uid_hex}"
                            
                            print(f"🚀 Отваряне в браузъра: {final_url}")
                            webbrowser.open(final_url)
                        else:
                            print("❌ Не е намерен валиден DARY линк в паметта на картата.")
            except Exception as e:
                print(f"Внимание (Грешка при четене): {e}")

def main():
    print("==================================================")
    print(" DARY CARD - NFC ЧЕТЕЦ МОСТ (Python & ACR1281U-C1)")
    print("==================================================")
    
    # Проверка дали изобщо има инсталирани PC/SC четци
    r = readers()
    if len(r) == 0:
        print("❌ Не е намерен свързан NFC четец!")
        print("Моля, включете ACR1281U-C1 към USB порта и рестартирайте програмата.")
        sys.exit(1)
        
    print(f"✅ Намерен четец: {r[0]}")
    print("✅ Слушам за карти... Натиснете Ctrl+C за изход.")
    
    cardmonitor = CardMonitor()
    cardobserver = DaryCardObserver()
    cardmonitor.addObserver(cardobserver)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nИзключване...")
    finally:
        cardmonitor.deleteObserver(cardobserver)

if __name__ == '__main__':
    main()
