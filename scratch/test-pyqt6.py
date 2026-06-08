import sys
try:
    from PyQt6.QtWidgets import QApplication
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEngineProfile
    
    app = QApplication(sys.argv)
    view = QWebEngineView()
    profile = view.page().profile()
    
    print("Profile retrieved successfully:", profile)
    print("HttpCacheType class exists:", hasattr(QWebEngineProfile, 'HttpCacheType'))
    if hasattr(QWebEngineProfile, 'HttpCacheType'):
        print("NoCache value:", QWebEngineProfile.HttpCacheType.NoCache)
        profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.NoCache)
        print("Set HttpCacheType to NoCache successfully!")
        
    profile.clearHttpCache()
    print("Cleared HTTP Cache successfully!")
    profile.clearAllVisitedLinks()
    print("Cleared visited links successfully!")
    
except Exception as e:
    print("ERROR encountered:")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("All PyQt6 tests passed successfully!")
sys.exit(0)
