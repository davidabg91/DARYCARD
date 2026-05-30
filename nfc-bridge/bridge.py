import sys
import time
import re
import os

from PyQt6.QtCore import Qt, QThread, pyqtSignal, QUrl, QTimer
from PyQt6.QtGui import QIcon, QFont, QTextCursor, QColor
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QTextEdit, QSplitter, QMessageBox)
from PyQt6.QtWebEngineWidgets import QWebEngineView

try:
    from smartcard.System import readers
    from smartcard.scard import *
    from smartcard.util import toHexString
except ImportError:
    pass # Will handle gracefully in main

def read_ndef_url(connection):
    raw_bytes = bytearray()
    for block in range(4, 36):
        try:
            data, s1, s2 = connection.transmit([0xFF, 0xB0, 0x00, block, 0x04])
            if s1 == 0x90 and s2 == 0x00:
                raw_bytes.extend(data)
            else:
                break
        except:
            break
    if len(raw_bytes) == 0:
        return None
    try:
        i = 0
        while i < len(raw_bytes) - 3:
            if raw_bytes[i] == 0x03:
                length = raw_bytes[i + 1]
                if i + 2 + length <= len(raw_bytes):
                    ndef_data = raw_bytes[i + 2: i + 2 + length]
                    if len(ndef_data) > 5 and ndef_data[3] == 0x55:
                        prefix_byte = ndef_data[4]
                        uri_body = ndef_data[5:].decode('ascii', errors='ignore').rstrip('\x00').rstrip('\xfe')
                        prefixes = {0x00: '', 0x01: 'http://www.', 0x02: 'https://www.',
                                    0x03: 'http://', 0x04: 'https://', 0x05: 'tel:'}
                        return prefixes.get(prefix_byte, '') + uri_body
            i += 1
    except:
        pass
    try:
        text = raw_bytes.decode('ascii', errors='ignore')
        match = re.search(r'(https?://\S+|darycommerce\.com\S+)', text)
        if match:
            return re.sub(r'[^\x20-\x7E].*$', '', match.group(1)).strip()
    except:
        pass
    return None

class NFCThread(QThread):
    # Сигнали
    reader_status = pyqtSignal(str, str) # text, color_hex
    main_status = pyqtSignal(str, str, str, str) # icon, text, color_hex, url_text
    history_add = pyqtSignal(str, bool) # text, is_success
    card_scanned = pyqtSignal(str) # final_url

    def __init__(self, cards_db):
        super().__init__()
        self.cards_db = cards_db
        self.running = True
        self.last_uid = None
        self.last_time = 0

    def run(self):
        while self.running:
            try:
                r = readers()
                nfc_reader = None
                for reader in r:
                    if "PICC" in str(reader).upper():
                        nfc_reader = reader
                        break
                if not nfc_reader and r:
                    nfc_reader = r[-1]

                if nfc_reader:
                    name = str(nfc_reader)
                    self.reader_status.emit(f"✅ Връзка: {name}", "#22c55e")
                    break
                else:
                    self.reader_status.emit("❌ Четецът не е намерен!", "#f87171")
                    time.sleep(2)
            except Exception as e:
                self.reader_status.emit(f"❌ Грешка: {e}", "#f87171")
                time.sleep(2)

        self.main_status.emit("📡", "Готов за сканиране", "#38bdf8", "Поставете карта върху четеца")

        card_present = False
        while self.running:
            try:
                connection = nfc_reader.createConnection()
                connection.connect()

                if not card_present:
                    card_present = True
                    self.main_status.emit("💳", "Обработка...", "#fbbf24", "Четене на данни...")

                uid_data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
                if sw1 == 0x90 and sw2 == 0x00:
                    uid_hex = toHexString(uid_data).replace(' ', '').upper()
                    current_time = time.time()
                    if uid_hex == self.last_uid and (current_time - self.last_time) < 3:
                        time.sleep(0.5)
                        continue

                    self.last_uid = uid_hex
                    self.last_time = current_time
                    url = read_ndef_url(connection)

                    if url:
                        url = url.strip().rstrip('\x00').strip()
                        if not url.startswith('http'):
                            url = 'https://' + url
                            
                        card_number = self.cards_db.get(url, None)
                        
                        hist_msg = f"💳 Карта {card_number}\n🔗 Линк: {url}\n🆔 UID: {uid_hex}" if card_number else f"🆔 UID: {uid_hex}\n🔗 Линк: {url}"
                        self.history_add.emit(hist_msg, True)
                        
                        separator = '&' if '?' in url else '?'
                        final_url = f"{url}{separator}uid={uid_hex}"

                        display_url = f"Линк: {url}\nХардуерен номер: {uid_hex}"
                        if card_number:
                            display_url = f"Отпечатан номер: {card_number}\n" + display_url
                            
                        self.main_status.emit("✅", "Успешно!", "#22c55e", display_url)
                        self.card_scanned.emit(final_url)
                        
                        time.sleep(2)
                        self.main_status.emit("📡", "Готов за следваща", "#38bdf8", "Поставете карта върху четеца")
                    else:
                        self.history_add.emit("Невалидна карта", False)
                        self.main_status.emit("❌", "Неуспешно четене", "#f87171", "Липсва DARY линк в картата")
                        time.sleep(2)
                        self.main_status.emit("📡", "Готов за сканиране", "#38bdf8", "Поставете карта върху четеца")

            except Exception as e:
                err_str = str(e).lower()
                if card_present and any(x in err_str for x in ["no smart card", "removed", "not present", "unresponsive", "t0 or t1", "does not recognize"]):
                    card_present = False
                    self.main_status.emit("📡", "Готов за сканиране", "#38bdf8", "Поставете карта върху четеца")

            time.sleep(0.3)

    def stop(self):
        self.running = False
        self.wait()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DARY NFC Четец - Премиум (Вграден Браузър)")
        self.setMinimumSize(900, 600)
        self.resize(1200, 800)
        
        # Зареждане на иконата
        try:
            base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
            ico = os.path.join(base, "true_icon.ico")
            if os.path.exists(ico):
                self.setWindowIcon(QIcon(ico))
        except Exception:
            pass
            
        # Фикс за лентата на задачите
        try:
            import ctypes
            myappid = 'darycommerce.nfc.reader.3'
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
        except Exception:
            pass

        self.cards_db = self.load_cards_database()
        self.setup_ui()
        
        # Стартиране на фоновата нишка
        self.nfc_thread = NFCThread(self.cards_db)
        self.nfc_thread.reader_status.connect(self.update_reader_status)
        self.nfc_thread.main_status.connect(self.update_main_status)
        self.nfc_thread.history_add.connect(self.add_history_entry)
        self.nfc_thread.card_scanned.connect(self.load_url)
        self.nfc_thread.start()

    def load_cards_database(self):
        db = {}
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        cards_file = os.path.join(base_dir, "cards.txt")
        if os.path.exists(cards_file):
            try:
                with open(cards_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 2:
                            url = parts[0].strip()
                            number = parts[1].strip()
                            db[url] = number
            except Exception:
                pass
        return db

    def setup_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # QSplitter за разделяне на екрана
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setStyleSheet(
            "QSplitter::handle {"
            "  background-color: #27272a;"
            "}"
            "QSplitter::handle:horizontal {"
            "  width: 1px;"
            "}"
        )
        main_layout.addWidget(splitter)

        # --- ЛЯВ ПАНЕЛ (Контрол и Статус) ---
        left_panel = QWidget()
        left_panel.setStyleSheet("background-color: #121214;")
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(0)
        
        # Хедър
        header = QWidget()
        header.setStyleSheet("background-color: #991b1b; border-bottom: 2px solid #ef4444;")
        header_layout = QVBoxLayout(header)
        header_layout.setContentsMargins(20, 20, 20, 20)
        
        title_layout = QHBoxLayout()
        title_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        logo_label = QLabel()
        try:
            base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
            ico = os.path.join(base, "true_icon.ico")
            if os.path.exists(ico):
                # Извличаме 128х128 версията за кристално чисто качество
                pixmap = QIcon(ico).pixmap(128, 128)
                if not pixmap.isNull():
                    pixmap = pixmap.scaled(36, 36, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                    logo_label.setPixmap(pixmap)
        except Exception:
            pass

        title = QLabel("DARY CARD")
        title.setFont(QFont("Segoe UI", 24, QFont.Weight.Bold))
        title.setStyleSheet("color: #ffffff;")
        
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title)
        
        subtitle = QLabel("Професионален NFC Терминал")
        subtitle.setFont(QFont("Segoe UI", 11))
        subtitle.setStyleSheet("color: #fecaca;")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        header_layout.addLayout(title_layout)
        header_layout.addWidget(subtitle)
        left_layout.addWidget(header)

        # Статус четец
        reader_widget = QWidget()
        reader_widget.setStyleSheet("background-color: #1a1a1e; border-bottom: 1px solid #27272a;")
        reader_layout = QVBoxLayout(reader_widget)
        reader_layout.setContentsMargins(20, 10, 20, 10)
        
        self.lbl_reader = QLabel("⏳ Търсене на четец...")
        self.lbl_reader.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        self.lbl_reader.setStyleSheet("color: #a1a1aa;")
        reader_layout.addWidget(self.lbl_reader)
        left_layout.addWidget(reader_widget)

        # Главен статус
        status_widget = QWidget()
        status_layout = QVBoxLayout(status_widget)
        status_layout.setContentsMargins(20, 30, 20, 30)
        status_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        self.lbl_icon = QLabel("📡")
        self.lbl_icon.setFont(QFont("Segoe UI", 48))
        self.lbl_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.lbl_status = QLabel("Готов за сканиране")
        self.lbl_status.setFont(QFont("Segoe UI", 18, QFont.Weight.Bold))
        self.lbl_status.setStyleSheet("color: #38bdf8;")
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.lbl_url = QLabel("Поставете карта върху четеца")
        self.lbl_url.setFont(QFont("Segoe UI", 10))
        self.lbl_url.setStyleSheet("color: #a1a1aa;")
        self.lbl_url.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_url.setWordWrap(True)
        
        status_layout.addWidget(self.lbl_icon)
        status_layout.addWidget(self.lbl_status)
        status_layout.addWidget(self.lbl_url)
        left_layout.addWidget(status_widget)

        # Заглавие история
        hist_header = QWidget()
        hist_header.setStyleSheet("background-color: #1a1a1e; border-top: 1px solid #27272a; border-bottom: 1px solid #27272a;")
        hist_header_layout = QVBoxLayout(hist_header)
        hist_header_layout.setContentsMargins(20, 10, 20, 10)
        lbl_hist_title = QLabel("📋 История на сканиранията")
        lbl_hist_title.setFont(QFont("Segoe UI", 12, QFont.Weight.Bold))
        lbl_hist_title.setStyleSheet("color: #e4e4e7;")
        hist_header_layout.addWidget(lbl_hist_title)
        left_layout.addWidget(hist_header)

        # Поле за история
        self.txt_history = QTextEdit()
        self.txt_history.setReadOnly(True)
        self.txt_history.setFont(QFont("Segoe UI", 10))
        self.txt_history.setStyleSheet(
            "QTextEdit {"
            "  background-color: #121214;"
            "  border: none;"
            "  padding: 12px;"
            "  color: #e4e4e7;"
            "}"
            "QScrollBar:vertical {"
            "  border: none;"
            "  background: #121214;"
            "  width: 8px;"
            "  margin: 0px;"
            "}"
            "QScrollBar::handle:vertical {"
            "  background: #27272a;"
            "  min-height: 20px;"
            "  border-radius: 4px;"
            "}"
            "QScrollBar::handle:vertical:hover {"
            "  background: #3f3f46;"
            "}"
            "QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {"
            "  height: 0px;"
            "}"
        )
        left_layout.addWidget(self.txt_history, 1) # Разпъва се

        # Футър
        footer = QWidget()
        footer.setStyleSheet("background-color: #18181b;")
        footer_layout = QHBoxLayout(footer)
        footer_layout.setContentsMargins(20, 10, 20, 10)
        
        lbl_cards = QLabel(f"Заредени: {len(self.cards_db)} бр.")
        lbl_cards.setFont(QFont("Segoe UI", 9))
        lbl_cards.setStyleSheet("color: #cbd5e1;")
        
        lbl_phone = QLabel("📞 При проблем: 0876141826")
        lbl_phone.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        lbl_phone.setStyleSheet("color: #fca5a5;")
        lbl_phone.setAlignment(Qt.AlignmentFlag.AlignRight)
        
        footer_layout.addWidget(lbl_cards)
        footer_layout.addWidget(lbl_phone)
        
        # Червена линия над футъра
        red_line = QWidget()
        red_line.setFixedHeight(3)
        red_line.setStyleSheet("background-color: #dc2626;")
        left_layout.addWidget(red_line)
        left_layout.addWidget(footer)

        # --- ДЕСЕН ПАНЕЛ (Уеб браузър) ---
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        
        self.browser = QWebEngineView()
        self.browser.page().featurePermissionRequested.connect(self.handle_permission_requested)
        
        # Disable cache and clear it to prevent running stale React bundles
        try:
            from PyQt6.QtWebEngineCore import QWebEngineProfile
            profile = self.browser.page().profile()
            profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.NoCache)
            profile.clearHttpCache()
            profile.clearAllVisitedLinks()
        except Exception as e:
            print("Failed to configure QWebEngine profile/cache settings:", e)
            
        self.browser.setUrl(QUrl("https://darycommerce.com"))
        right_layout.addWidget(self.browser)

        # Добавяне в сплитера
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        
        # Задаване на първоначални размери (Ляв: 350px, Десен: Останалото)
        splitter.setSizes([350, 850])

    def handle_permission_requested(self, security_origin, feature):
        from PyQt6.QtWebEngineCore import QWebEnginePage
        if feature in (
            QWebEnginePage.Feature.MediaVideoCapture,
            QWebEnginePage.Feature.MediaAudioVideoCapture
        ):
            self.browser.page().setFeaturePermission(
                security_origin,
                feature,
                QWebEnginePage.PermissionPolicy.PermissionGrantedByUser
            )
        else:
            self.browser.page().setFeaturePermission(
                security_origin,
                feature,
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
            )

    def update_reader_status(self, text, color):
        self.lbl_reader.setText(text)
        self.lbl_reader.setStyleSheet(f"color: {color};")

    def update_main_status(self, icon, text, color, url_text):
        self.lbl_icon.setText(icon)
        self.lbl_status.setText(text)
        self.lbl_status.setStyleSheet(f"color: {color};")
        self.lbl_url.setText(url_text)

    def add_history_entry(self, text, is_success):
        time_str = time.strftime('%H:%M:%S')
        icon = "✅" if is_success else "❌"
        color = "#4ade80" if is_success else "#f87171"
        
        full_text = f"{icon} [{time_str}]\n{text}\n\n"
        
        self.txt_history.moveCursor(QTextCursor.MoveOperation.Start)
        self.txt_history.setTextColor(QColor(color))
        self.txt_history.insertPlainText(full_text)
        
    def load_url(self, url):
        qurl = QUrl(url)
        if self.browser.url() == qurl:
            self.browser.reload()
        else:
            self.browser.setUrl(qurl)

    def closeEvent(self, event):
        self.nfc_thread.stop()
        event.accept()

def main():
    if "smartcard" not in sys.modules:
        # Pyscard not found error handled with PyQt
        app = QApplication(sys.argv)
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Icon.Critical)
        msg.setText("Липсва библиотеката 'pyscard'!\nНапишете в CMD: pip install pyscard")
        msg.exec()
        sys.exit(1)
        
    app = QApplication(sys.argv)
    app.setStyle("Fusion") # Модерен стил
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
