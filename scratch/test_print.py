import sys
import traceback

# Add nfc-bridge directory to python path
sys.path.append(r"d:\DARY\nfc-bridge")

try:
    import bridge
    print("Successfully imported bridge.py")
    
    # 1. Set context sharing attribute
    from PyQt6.QtCore import QCoreApplication, Qt
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    
    # 2. Load dependencies (which imports QtWebEngineWidgets)
    bridge.load_dependencies()
    print("Successfully loaded dependencies")
    
    # 3. Create QApplication
    from PyQt6.QtWidgets import QApplication
    app = QApplication(sys.argv)
    
    window = bridge.MainWindow()
    print("Successfully initialized MainWindow")
    
    print("Calling handle_print_requested...")
    # Let's check if QPrinter and QPrintDialog can be imported and instantiated
    from PyQt6.QtPrintSupport import QPrinter, QPrintDialog
    printer = QPrinter(QPrinter.PrinterMode.HighResolution)
    print("Successfully instantiated QPrinter")
    
    # Check if view.print exists and get its signature
    view = window.browser
    print("view.print exists:", hasattr(view, 'print'))
    
    # Mocking QPrintDialog to test the print call itself
    # We will temporarily mock dialog.exec to return Accepted (DialogCode.Accepted = 1)
    original_exec = QPrintDialog.exec
    QPrintDialog.exec = lambda self: 1 # Mock Accepted
    
    # Trigger print
    window.handle_print_requested()
    print("Finished handle_print_requested call successfully!")
    
except Exception as e:
    print("--- ERROR DETECTED ---")
    traceback.print_exc()
    sys.exit(1)
