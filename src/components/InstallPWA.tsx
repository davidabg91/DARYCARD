import React, { useEffect, useState } from 'react';
import { Download, PlusSquare, ArrowUpFromLine, MoreVertical } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const InstallPWA: React.FC = () => {
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  
  const [isIOS] = useState(() => 
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
  );
  
  const [showIOSModal, setShowIOSModal] = useState(false);
  
  const [isStandalone] = useState(() => 
    window.matchMedia('(display-mode: standalone)').matches || 
    ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone === true)
  );

  const [showManualModal, setShowManualModal] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const installEvent = e as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setPromptInstall(installEvent);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);

    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  const onClick = (evt: React.MouseEvent) => {
    evt.preventDefault();
    if (isIOS) {
      setShowIOSModal(true);
    } else if (promptInstall) {
      promptInstall.prompt();
    } else {
      // If we don't have the prompt event, show manual instructions for Android/Desktop
      setShowManualModal(true);
    }
  };

  if (isStandalone) {
    return null;
  }

  return (
    <>
      <button
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.8rem 1.5rem',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.95rem',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          marginTop: '1rem',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.borderColor = 'rgba(255,82,82,0.3)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <Download size={20} color="#ff5252" />
        ИНСТАЛИРАЙ КАТО ПРИЛОЖЕНИЕ
      </button>

      {showIOSModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '1rem',
          animation: 'fadeIn 0.3s ease'
        }} onClick={() => setShowIOSModal(false)}>
          <div style={{
            background: '#1a1a1a',
            width: '100%',
            maxWidth: '400px',
            borderRadius: '28px',
            padding: '2rem',
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'rgba(255,82,82,0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <PlusSquare size={32} color="#ff5252" />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '1rem', color: '#fff' }}>ИНСТАЛИРАНЕ НА IPHONE</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', marginBottom: '2rem', fontSize: '0.95rem' }}>
                За да инсталирате приложението на вашия iPhone, натиснете бутона <strong>Споделяне</strong> в браузъра и изберете <strong>"Добавяне към началния екран"</strong>.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}>
                        <ArrowUpFromLine size={20} color="#fff" />
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>1. Натиснете бутона "Споделяне"</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}>
                        <PlusSquare size={20} color="#fff" />
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>2. Изберете "Добавяне към начален екран"</span>
                </div>
            </div>

            <button 
                onClick={() => setShowIOSModal(false)}
                style={{ width: '100%', background: '#ff5252', color: '#fff', padding: '1.2rem', borderRadius: '18px', border: 'none', fontWeight: 900, fontSize: '1.1rem', marginTop: '2rem', cursor: 'pointer' }}
            >
                РАЗБРАХ
            </button>
          </div>
        </div>
      )}

      {showManualModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          animation: 'fadeIn 0.3s ease'
        }} onClick={() => setShowManualModal(false)}>
          <div style={{
            background: '#1a1a1a',
            width: '100%',
            maxWidth: '400px',
            borderRadius: '28px',
            padding: '2rem',
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'rgba(255,82,82,0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <MoreVertical size={32} color="#ff5252" />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '1rem', color: '#fff' }}>ИНСТАЛИРАНЕ НА ПРИЛОЖЕНИЕТО</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', marginBottom: '2rem', fontSize: '0.95rem' }}>
                Вашият браузър в момента не предлага автоматично инсталиране (това се случва, ако вече сте го инсталирали веднъж или сте отхвърлили поканата). Можете да го добавите ръчно:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}>
                        <MoreVertical size={20} color="#fff" />
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>1. Натиснете менюто (трите точки горе вдясно)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px' }}>
                        <Download size={20} color="#fff" />
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>2. Изберете "Инсталиране на приложение" или "Добавяне към началния екран"</span>
                </div>
            </div>

            <button 
                onClick={() => setShowManualModal(false)}
                style={{ width: '100%', background: '#ff5252', color: '#fff', padding: '1.2rem', borderRadius: '18px', border: 'none', fontWeight: 900, fontSize: '1.1rem', marginTop: '2rem', cursor: 'pointer' }}
            >
                РАЗБРАХ
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </>
  );
};

export default InstallPWA;
