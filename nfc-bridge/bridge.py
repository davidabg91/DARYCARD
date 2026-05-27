import sys
import time
import re
import webbrowser

try:
    from smartcard.System import readers
    from smartcard.scard import *
    from smartcard.util import toHexString
except ImportError:
    print("❌ Липсва библиотеката 'pyscard'!")
    print("Моля, отворете командния ред (CMD) и напишете: pip install pyscard")
    input("Натиснете Enter за изход...")
    sys.exit(1)

def main():
    try:
        print("==================================================")
        print(" DARY CARD - NFC ЧЕТЕЦ МОСТ (Python & ACR1281U-C1)")
        print("==================================================")
        
        # Проверка дали изобщо има инсталирани PC/SC четци
        r = readers()
        print("🔍 Намерени хардуерни устройства (четци):")
        for idx, reader in enumerate(r):
            print(f"  [{idx}] {reader}")
            
        if len(r) == 0:
            print("❌ Не е намерен свързан NFC четец!")
            print("Моля, включете ACR1281U-C1 към USB порта и рестартирайте програмата.")
            input("Натиснете Enter за изход...")
            sys.exit(1)
            
        # Намираме NFC (PICC) четеца.
        nfc_reader = None
        for reader in r:
            # Търсим нещо, което подсказва безконтактен четец (PICC, Contactless, CL)
            reader_name = str(reader).upper()
            if "PICC" in reader_name or "CL" in reader_name or "CONTACTLESS" in reader_name:
                nfc_reader = reader
                break
        
        # Ако все още няма, взимаме последния наличен (често PICC е вторият четец)
        if not nfc_reader:
            nfc_reader = r[-1]
            
        print(f"✅ Намерен четец: {nfc_reader}")
        print("✅ Слушам за карти... Натиснете Ctrl+C за изход.")
        
        last_uid = None
        last_time = 0

        while True:
            try:
                # Опит за свързване (ако няма карта, хвърля грешка и отива в except)
                connection = nfc_reader.createConnection()
                connection.connect()

                # Четене на UID чрез стандартна PC/SC APDU команда
                uid_data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
                if sw1 == 0x90 and sw2 == 0x00:
                    uid_hex = toHexString(uid_data).replace(' ', '').upper()
                    
                    # Проверка против двойно сканиране (debounce 2 секунди)
                    current_time = time.time()
                    if uid_hex == last_uid and (current_time - last_time) < 2:
                        time.sleep(0.5)
                        continue
                        
                    last_uid = uid_hex
                    last_time = current_time
                    
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
                err_str = str(e).lower()
                # Игнорираме грешката, че няма поставена карта
                if "no smart card" not in err_str and "unresponsive" not in err_str and "removed" not in err_str and "not present" not in err_str:
                    print(f"Грешка при връзка с картата: {e}")
                
            time.sleep(0.3)  # Почивка между опитите, за да не натоварва процесора
            
    except KeyboardInterrupt:
        print("\nИзключване...")
    except Exception as e:
        print(f"\n❌ Критична грешка: {e}")
        print("Възможно е услугата 'Smart Card' на Windows да не работи или четецът да не е инсталиран правилно.")
        input("Натиснете Enter за изход...")

if __name__ == '__main__':
    main()
