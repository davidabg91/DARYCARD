import sys
from PyQt6.QtCore import Qt, QCoreApplication
from PyQt6.QtWidgets import QApplication

def test():
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv)
    
    # Now lazy import web engine
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    print("Imported QWebEngineView successfully!")

if __name__ == '__main__':
    test()
