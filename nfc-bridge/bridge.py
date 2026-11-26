import sys
import time
import re
import os
import glob
import tempfile
from urllib.parse import urlsplit

from PyQt6.QtCore import Qt, QThread, pyqtSignal, QUrl, QTimer, QRectF, QCoreApplication, QLockFile, QDir, QEvent
from PyQt6.QtGui import QIcon, QFont, QTextCursor, QColor, QPainter, QPen, QPixmap
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QLabel, QTextEdit, QSplitter, QMessageBox)

APP_VERSION = "3.1"
# Името определя и папката с данните на вградения браузър
# (%APPDATA%\DARY-NFC-Chetec) — не се сменя, иначе входът се губи.
APP_NAME = "DARY-NFC-Chetec"
HOME_URL = "https://darycommerce.com"
# Само тези адреси се отварят от карта и само те получават камерата.
ALLOWED_HOSTS = {"darycommerce.com", "www.darycommerce.com", "davidabg91.github.io"}

# Globally loaded dependencies placeholder
QWebEngineView = None
QWebEnginePage = None
QWebEngineProfile = None
CustomWebPage = None
readers = None
toHexString = None
NoCardException = None
smartcard_available = False


def is_dary_url(url):
    """Адресът от картата трябва да е https и на наш домейн."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return parts.scheme == "https" and (parts.hostname or "").lower() in ALLOWED_HOSTS


def load_dependencies():
    global QWebEngineView, QWebEnginePage, QWebEngineProfile, CustomWebPage
    global readers, toHexString, NoCardException, smartcard_available

    # Import PyQt6 WebEngine
    from PyQt6.QtWebEngineWidgets import QWebEngineView as _QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEnginePage as _QWebEnginePage
    from PyQt6.QtWebEngineCore import QWebEngineProfile as _QWebEngineProfile
    QWebEngineView = _QWebEngineView
    QWebEnginePage = _QWebEnginePage
    QWebEngineProfile = _QWebEngineProfile

    class _CustomWebPage(QWebEnginePage):
        def __init__(self, profile, owner, parent=None):
            super().__init__(profile, parent)
            self.owner = owner            # главният прозорец
            self.browser_view = parent    # QWebEnginePage няма .view() в PyQt6

        def javaScriptConsoleMessage(self, level, message, line, sourceID):
            if message.startswith("[DARY_BRIDGE_LOG]:"):
                self.owner.browser_log.emit(message[len("[DARY_BRIDGE_LOG]:"):].strip())
            super().javaScriptConsoleMessage(level, message, line, sourceID)

        def createWindow(self, window_type):
            try:
                return self.owner.open_popup()
            except Exception as e:
                print("Error creating window in QWebEnginePage:", e)
                try:
                    self.owner.browser_log.emit(f"Грешка при отваряне на прозорец: {e}")
                except Exception:
                    pass
                return None

    CustomWebPage = _CustomWebPage

    # Try importing smartcard (pyscard)
    try:
        from smartcard.System import readers as _readers
        from smartcard.util import toHexString as _toHexString
        from smartcard.Exceptions import NoCardException as _NoCardException
        readers = _readers
        toHexString = _toHexString
        NoCardException = _NoCardException
        smartcard_available = True
    except ImportError:
        smartcard_available = False


URI_PREFIXES = {0x00: '', 0x01: 'http://www.', 0x02: 'https://www.',
                0x03: 'http://', 0x04: 'https://', 0x05: 'tel:'}


def read_card_bytes(connection):
    """Страници 4–35 на NTAG/Ultralight (128 байта) — колкото чете и терминалът."""
    raw_bytes = bytearray()
    for block in range(4, 36):
        try:
            data, s1, s2 = connection.transmit([0xFF, 0xB0, 0x00, block, 0x04])
            if s1 == 0x90 and s2 == 0x00:
                raw_bytes.extend(data)
            else:
                break
        except Exception:
            break
    return raw_bytes


def _uri_from_record(ndef_data):
    """Адресът от NDEF запис тип „U“ или None."""
    if len(ndef_data) > 5 and ndef_data[3] == 0x55:
        # Къс запис (SR): дължината на съдържанието е в третия байт.
        if ndef_data[0] & 0x10 and ndef_data[1] == 1:
            payload = ndef_data[4:4 + ndef_data[2]]
        else:
            payload = ndef_data[4:]
        if len(payload) < 2:
            return None
        body = bytes(payload[1:]).decode('ascii', errors='ignore').rstrip('\x00').rstrip('\xfe')
        return URI_PREFIXES.get(payload[0], '') + body
    return None


def parse_ndef_url(raw_bytes):
    """Връща (адрес, цял_ли_е).

    Картата може да се прочете наполовина, докато още се приближава към четеца.
    Тогава от байтовете пак се вади нещо, което прилича на адрес, но е отрязано —
    а отрязан адрес значи отрязан код на карта и профил под грешно ид. Затова
    адрес, за който не е сигурно, че е прочетен докрай, се връща с False.
    """
    if not raw_bytes:
        return None, False

    # 1) По правилата: вървим по TLV блоковете до NDEF съобщението (0x03).
    i = 0
    truncated = False
    while i < len(raw_bytes) - 1:
        tag = raw_bytes[i]
        if tag == 0x00:
            i += 1
            continue
        if tag == 0xFE:
            break
        length = raw_bytes[i + 1]
        if length == 0xFF:
            break
        if tag == 0x03:
            end = i + 2 + length
            if end > len(raw_bytes):
                truncated = True
            else:
                url = _uri_from_record(raw_bytes[i + 2:end])
                if url:
                    return url, True
            break
        i += 2 + length

    # 2) Както досега: първият 0x03, след който има цял запис.
    if not truncated:
        try:
            i = 0
            while i < len(raw_bytes) - 3:
                if raw_bytes[i] == 0x03:
                    length = raw_bytes[i + 1]
                    if i + 2 + length <= len(raw_bytes):
                        url = _uri_from_record(raw_bytes[i + 2: i + 2 + length])
                        if url:
                            return url, True
                i += 1
        except Exception:
            pass

    # 3) Последен опит: нещо, което прилича на адрес. За цял го броим само ако
    #    след него има край (непечатаем байт), а не свършват прочетените данни.
    try:
        text = bytes(raw_bytes).decode('latin-1')
        match = re.search(r'(https?://[\x21-\x7E]+|darycommerce\.com[\x21-\x7E]+)', text)
        if match:
            complete = (not truncated) and match.end() < len(text)
            return match.group(1).strip(), complete
    except Exception:
        pass
    return None, False


def read_ndef_url(connection):
    """Адресът от картата или None (оставено заради старите извиквания)."""
    url, _complete = parse_ndef_url(read_card_bytes(connection))
    return url


class NFCThread(QThread):
    # Сигнали
    reader_status = pyqtSignal(str, str) # text, color_hex
    main_status = pyqtSignal(str, str, str, str) # icon, text, color_hex, url_text
    history_add = pyqtSignal(str, bool) # text, is_success
    card_scanned = pyqtSignal(str) # final_url

    POLL_SECONDS = 0.3
    # Толкова поредни проверки без карта = картата е вдигната (0.6 s).
    # Едно пропуснато четене, докато картата си стои, не бива да я „сканира“ пак.
    MISSES_FOR_REMOVAL = 2
    # На толкова проверки без карта се гледа дали четецът още е включен (~3 s).
    READER_CHECK_EVERY = 10

    def __init__(self, cards_db):
        super().__init__()
        self.cards_db = cards_db
        self.running = True

    def _sleep(self, seconds):
        """Сън, който се прекъсва при затваряне на програмата."""
        end = time.time() + seconds
        while self.running and time.time() < end:
            time.sleep(min(0.1, max(0.0, end - time.time())))

    def _find_reader(self):
        r = readers()
        for reader in r:
            if "PICC" in str(reader).upper():
                return reader
        return r[-1] if r else None

    def _reader_connected(self, reader):
        try:
            return str(reader) in [str(x) for x in readers()]
        except Exception:
            return False

    def _ready(self, text="Готов за сканиране"):
        self.main_status.emit("📡", text, "#38bdf8", "Поставете карта върху четеца")

    def run(self):
        nfc_reader = None
        announced_missing = False
        card_present = False
        handled_uid = None      # карта, за която вече е отворен профил, докато стои на четеца
        misses = 0
        idle_polls = 0

        while self.running:
            # --- Четецът: търси се и в началото, и след като е бил изваден ---
            if nfc_reader is None:
                try:
                    nfc_reader = self._find_reader()
                except Exception as e:
                    self.reader_status.emit(f"❌ Грешка: {e}", "#f87171")
                    self._sleep(2)
                    continue
                if nfc_reader is None:
                    if not announced_missing:
                        self.reader_status.emit("❌ Четецът не е намерен!", "#f87171")
                        self.main_status.emit("🔌", "Няма четец", "#f87171", "Включете четеца в USB порта")
                        announced_missing = True
                    self._sleep(2)
                    continue
                announced_missing = False
                card_present = False
                handled_uid = None
                misses = 0
                idle_polls = 0
                self.reader_status.emit(f"✅ Връзка: {nfc_reader}", "#22c55e")
                self._ready()

            # --- Има ли карта ---
            connection = None
            try:
                connection = nfc_reader.createConnection()
                connection.connect()
            except Exception as e:
                no_card = NoCardException is not None and isinstance(e, NoCardException)
                idle_polls += 1
                if (not no_card) or idle_polls % self.READER_CHECK_EVERY == 0:
                    if not self._reader_connected(nfc_reader):
                        nfc_reader = None
                        self.reader_status.emit("❌ Четецът е изключен!", "#f87171")
                        self.main_status.emit("🔌", "Четецът е изключен", "#f87171", "Включете го отново в USB порта")
                        announced_missing = True
                        self._sleep(1)
                        continue
                misses += 1
                if misses >= self.MISSES_FOR_REMOVAL and (card_present or handled_uid is not None):
                    card_present = False
                    handled_uid = None
                    self._ready()
                self._sleep(self.POLL_SECONDS)
                continue

            try:
                misses = 0
                idle_polls = 0
                uid_data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
                if not (sw1 == 0x90 and sw2 == 0x00):
                    self._sleep(self.POLL_SECONDS)
                    continue
                uid_hex = toHexString(uid_data).replace(' ', '').upper()

                # Същата карта още стои върху четеца — нищо ново. Преди профилът се
                # отваряше наново на всеки ~3 секунди и страницата се презареждаше,
                # докато служителят попълва.
                if uid_hex == handled_uid:
                    self._sleep(self.POLL_SECONDS)
                    continue

                if not card_present:
                    card_present = True
                    self.main_status.emit("💳", "Обработка...", "#fbbf24", "Четене на данни...")

                # До три опита: картата може още да се намества.
                url, complete = None, False
                for _attempt in range(3):
                    url, complete = parse_ndef_url(read_card_bytes(connection))
                    if url and complete:
                        break
                    self._sleep(0.15)

                handled_uid = uid_hex

                if url:
                    url = url.strip().rstrip('\x00').strip()
                    if not url.startswith('http'):
                        url = 'https://' + url

                if not url:
                    self.history_add.emit(f"Невалидна карта\n🆔 UID: {uid_hex}", False)
                    self.main_status.emit("❌", "Неуспешно четене", "#f87171", "Липсва DARY линк в картата")
                elif not complete:
                    self.history_add.emit(f"Картата е прочетена непълно\n🆔 UID: {uid_hex}", False)
                    self.main_status.emit("❌", "Непълно четене", "#f87171", "Вдигнете картата и я сложете отново, плътно върху четеца")
                elif not is_dary_url(url):
                    self.history_add.emit(f"Чужда карта — линкът не е на DARY и не се отваря\n🔗 {url[:80]}\n🆔 UID: {uid_hex}", False)
                    self.main_status.emit("⛔", "Чужда карта", "#f87171", "Линкът в картата не е на DARY")
                else:
                    card_number = self.cards_db.get(url, None)

                    hist_msg = f"💳 Карта {card_number}\n🔗 Линк: {url}\n🆔 UID: {uid_hex}" if card_number else f"🆔 UID: {uid_hex}\n🔗 Линк: {url}"
                    self.history_add.emit(hist_msg, True)

                    separator = '&' if '?' in url else '?'
                    final_url = f"{url}{separator}uid={uid_hex}"

                    display_url = f"Линк: {url}\nХардуерен номер: {uid_hex}"
                    if card_number:
                        display_url = f"Отпечатан номер: {card_number}\n" + display_url

                    self.main_status.emit("✅", "Успешно!", "#22c55e", display_url + "\n\nВдигнете картата, за да сканирате следващата")
                    self.card_scanned.emit(final_url)

            except Exception:
                # Картата е мръднала по средата на четенето — следващата проверка решава.
                pass
            finally:
                try:
                    connection.disconnect()
                except Exception:
                    pass

            self._sleep(self.POLL_SECONDS)

    def stop(self):
        self.running = False
        self.wait()

class DarySplashScreen(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.SplashScreen)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.resize(300, 300)
        
        # Center on screen
        screen = QApplication.primaryScreen().geometry()
        self.move((screen.width() - self.width()) // 2, (screen.height() - self.height()) // 2)
        
        # Load logo
        self.logo_pixmap = QPixmap()
        try:
            base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
            ico = os.path.join(base, "true_icon.ico")
            if os.path.exists(ico):
                self.logo_pixmap = QIcon(ico).pixmap(256, 256)
        except:
            pass
            
        self.angle = 0
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.rotate)
        self.timer.start(16) # ~60 FPS
        
    def rotate(self):
        self.angle = (self.angle + 4) % 360
        self.update()
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Draw semi-transparent dark background card
        painter.setBrush(QColor(18, 18, 20, 245)) # matching app background #121214
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(QRectF(10, 10, 280, 280), 24, 24)
        
        # Draw loading arc
        pen = QPen(QColor("#dc2626")) # Red spinner
        pen.setWidth(4)
        painter.setPen(pen)
        
        # Draw rotating arc (Qt draws arc in 1/16th of a degree)
        rect = QRectF(60, 60, 180, 180)
        painter.drawArc(rect, self.angle * 16, 120 * 16)
        
        # Draw logo in the center
        if not self.logo_pixmap.isNull():
            logo_rect = QRectF(100, 100, 100, 100)
            painter.drawPixmap(logo_rect.toRect(), self.logo_pixmap.scaled(100, 100, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        
        painter.drawText(QRectF(10, 220, 280, 40), Qt.AlignmentFlag.AlignCenter, "Зареждане...")



def cleanup_old_reports(max_age_hours=12):
    """Трие старите PDF файлове за печат от временната папка.

    Във всеки има клиентски данни, а досега оставаха там завинаги.
    """
    limit = time.time() - max_age_hours * 3600
    for path in glob.glob(os.path.join(tempfile.gettempdir(), "dary_report_*.pdf")):
        try:
            if os.path.getmtime(path) < limit:
                os.remove(path)
        except OSError:
            pass


class MainWindow(QMainWindow):
    browser_log = pyqtSignal(str)

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

        self.extra_windows = []     # отделните прозорци (профил на клиент, печат)
        self.report_paths = []      # PDF файловете, направени в тази сесия

        # Постоянен профил на браузъра. Профилът по подразбиране в Qt6 е
        # „инкогнито“: входът се губеше при всяко затваряне на програмата, а
        # мястото за данни на сайта беше малка част от паметта и се препълваше
        # („Картата не е намерена … QuotaExceededError“). Именуваният профил пази
        # данните на диска в %APPDATA%\DARY-NFC-Chetec.
        self.profile = QWebEngineProfile("DaryCard", QApplication.instance())
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
        # Без HTTP кеш — да не се зарежда стар бъндъл на сайта.
        self.profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.NoCache)

        self.cards_db = self.load_cards_database()
        self.setup_ui()

        # Стартиране на фоновата нишка
        self.nfc_thread = NFCThread(self.cards_db)
        self.nfc_thread.reader_status.connect(self.update_reader_status)
        self.nfc_thread.main_status.connect(self.update_main_status)
        self.nfc_thread.history_add.connect(self.add_history_entry)
        self.nfc_thread.card_scanned.connect(self.load_url)
        self.browser_log.connect(self.add_browser_history_entry)
        self.nfc_thread.start()

    def load_cards_database(self):
        """Отпечатаните номера на първите 1000 карти (cards.txt).

        Търси се до програмата, после вътре в нея (инсталаторът го носи там).
        """
        db = {}
        candidates = []
        if getattr(sys, 'frozen', False):
            candidates.append(os.path.dirname(sys.executable))
        if getattr(sys, '_MEIPASS', None):
            candidates.append(sys._MEIPASS)
        candidates.append(os.path.dirname(os.path.abspath(__file__)))

        for base_dir in candidates:
            cards_file = os.path.join(base_dir, "cards.txt")
            if not os.path.exists(cards_file):
                continue
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
            if db:
                break
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
        header.setStyleSheet("background-color: #121214; border-bottom: 2px solid #27272a;")
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
        title.setStyleSheet("color: #dc2626;")
        
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title)
        
        subtitle = QLabel("Професионален NFC Терминал")
        subtitle.setFont(QFont("Segoe UI", 11))
        subtitle.setStyleSheet("color: #ffffff;")
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
        
        lbl_cards = QLabel(f"Заредени: {len(self.cards_db)} бр.  ·  v{APP_VERSION}")
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
        self.browser_page = CustomWebPage(self.profile, self, self.browser)
        self.browser.setPage(self.browser_page)
        self.wire_page(self.browser_page)

        self.browser.setUrl(QUrl(HOME_URL))
        right_layout.addWidget(self.browser)

        # Добавяне в сплитера
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)

        # Задаване на първоначални размери (Ляв: 350px, Десен: Останалото)
        splitter.setSizes([350, 850])

    def wire_page(self, page):
        page.featurePermissionRequested.connect(self.handle_permission_requested)
        page.printRequested.connect(self.handle_print_requested)

    def open_popup(self):
        """Нов прозорец, поискан от сайта (профил на клиент, печат)."""
        self.browser_log.emit("Отваряне на нов прозорец...")

        # Отделен прозорец без родител, за да се отваря самостоятелно
        new_window = QMainWindow()
        new_view = QWebEngineView(new_window)
        new_page = CustomWebPage(self.profile, self, new_view)
        new_view.setPage(new_page)
        self.wire_page(new_page)
        # window.close() от сайта затваря прозореца
        new_page.windowCloseRequested.connect(new_window.close)

        new_page.loadFinished.connect(
            lambda ok: None if ok else self.browser_log.emit("Новият прозорец не се зареди."))

        new_window.setCentralWidget(new_view)
        new_window.setWindowTitle("DARY CARD - Профил на Клиент")
        new_window.setWindowIcon(self.windowIcon())
        new_window.resize(1000, 750)

        # Изрични препратки, за да не ги прибере Python преждевременно
        new_window.browser_view = new_view
        new_window.browser_page = new_page

        new_window.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.extra_windows.append(new_window)
        new_window.destroyed.connect(lambda *_args, w=new_window: self._forget_popup(w))

        new_window.show()
        new_window.raise_()
        new_window.activateWindow()
        return new_page

    def _forget_popup(self, window):
        self.extra_windows = [w for w in self.extra_windows if w is not window]

    def handle_permission_requested(self, security_origin, feature):
        # Отговаря се на страницата, която пита — в отделните прозорци камерата
        # досега не тръгваше, защото отговорът отиваше при главната страница.
        page = self.sender()
        if page is None or not hasattr(page, 'setFeaturePermission'):
            page = self.browser_page

        wants_camera = feature in (
            QWebEnginePage.Feature.MediaVideoCapture,
            QWebEnginePage.Feature.MediaAudioVideoCapture
        )
        # Камерата е само за нашия сайт, не за каквато и да е отворена страница.
        ours = security_origin.scheme() == "https" and security_origin.host().lower() in ALLOWED_HOSTS

        page.setFeaturePermission(
            security_origin,
            feature,
            QWebEnginePage.PermissionPolicy.PermissionGrantedByUser if (wants_camera and ours)
            else QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
        )

    def handle_print_requested(self, *args, **kwargs):
        try:
            sender = self.sender() # This is the QWebEnginePage that requested printing
            page = sender if sender else self.browser.page()
            view = page.browser_view if (page and hasattr(page, 'browser_view')) else self.browser

            if not view:
                view = self.browser

            # Create a unique temporary file path for the PDF
            temp_dir = tempfile.gettempdir()
            pdf_path = os.path.join(temp_dir, f"dary_report_{int(time.time() * 1000)}.pdf")
            self.report_paths.append(pdf_path)

            # Keep reference to path on view to prevent garbage collection during async print
            view._printing_pdf_path = pdf_path

            # Connect callback to pdfPrintingFinished signal
            def on_pdf_finished(path, success):
                try:
                    # Disconnect signal to avoid multiple executions
                    try:
                        page.pdfPrintingFinished.disconnect(on_pdf_finished)
                    except Exception:
                        pass

                    if success:
                        self.browser_log.emit("PDF за печат е готов и се отваря.")
                        # Open the PDF using the system's default viewer (Chrome, Edge, Acrobat, etc.)
                        os.startfile(path)
                    else:
                        self.browser_log.emit("Неуспешно генериране на PDF за печат.")
                except Exception as ex:
                    print(f"Error opening printed PDF: {ex}")
                    self.browser_log.emit(f"Грешка при отваряне на PDF: {ex}")

            page.pdfPrintingFinished.connect(on_pdf_finished)

            # Trigger printing to PDF
            page.printToPdf(pdf_path)
            self.browser_log.emit("Подготвя се PDF за печат...")

        except Exception as e:
            err_msg = f"Грешка при подготовка на визуализация за печат: {e}"
            print(err_msg)
            self.browser_log.emit(err_msg)

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

    def add_browser_history_entry(self, text):
        time_str = time.strftime('%H:%M:%S')
        icon = "💻"
        color = "#c084fc"

        full_text = f"{icon} [{time_str}]\n{text}\n\n"

        self.txt_history.moveCursor(QTextCursor.MoveOperation.Start)
        self.txt_history.setTextColor(QColor(color))
        self.txt_history.insertPlainText(full_text)

    def load_url(self, url):
        # Втора проверка на адреса — тук идва всичко, което ще се отвори.
        if not is_dary_url(url):
            return
        qurl = QUrl(url)
        if self.browser.url() == qurl:
            # Същата карта, сложена пак: презареждане, за да се отчете ново сканиране.
            self.browser.reload()
        else:
            self.browser.setUrl(qurl)

    def release_web(self):
        """Страниците се махат преди профила — иначе Qt се оплаква при изход."""
        for window in list(self.extra_windows):
            try:
                window.close()
            except Exception:
                pass
        self.extra_windows = []
        # Затворените прозорци се трият „по-късно“ — нека е сега.
        try:
            QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete.value)
        except Exception:
            pass
        try:
            from PyQt6 import sip
            page, view = self.browser_page, self.browser
            self.browser_page = None
            self.browser = None
            sip.delete(page)
            sip.delete(view)
        except Exception:
            pass

    def closeEvent(self, event):
        self.nfc_thread.stop()
        # Отделните прозорци се затварят заедно с главния — иначе програмата
        # оставаше да работи без четец.
        for window in list(self.extra_windows):
            try:
                window.close()
            except Exception:
                pass
        # PDF файловете от тази сесия; отвореният в момента остава за следващото пускане.
        for path in self.report_paths:
            try:
                os.remove(path)
            except OSError:
                pass
        event.accept()

def main():
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setStyle("Fusion") # Модерен стил

    # Само едно копие: две програми върху един профил и един четец си пречат.
    lock = QLockFile(os.path.join(QDir.tempPath(), "darycard-pc.lock"))
    lock.setStaleLockTime(0)
    if not lock.tryLock(100):
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Icon.Information)
        msg.setWindowTitle("DARY CARD")
        msg.setText("Програмата вече е отворена.\nВижте лентата със задачите долу на екрана.")
        msg.exec()
        sys.exit(0)

    # Показване на зареждащия екран веднага
    splash = DarySplashScreen()
    splash.show()
    app.processEvents() # Изрисува го веднага на екрана

    # Зареждане на тежките библиотеки докато се показва зареждащия екран
    load_dependencies()
    app.processEvents()

    if not smartcard_available:
        splash.close()
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Icon.Critical)
        msg.setText("Липсва библиотеката 'pyscard'!\nНапишете в CMD: pip install pyscard")
        msg.exec()
        sys.exit(1)

    cleanup_old_reports()

    window = MainWindow()
    window.show()

    # Скриване на зареждащия екран след като главният прозорец е зареден и показан
    splash.close()

    code = app.exec()
    window.release_web()
    app.processEvents()
    lock.unlock()
    sys.exit(code)

if __name__ == '__main__':
    main()
