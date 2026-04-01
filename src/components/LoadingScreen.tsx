import logo from '../assets/logo_main.png';

const LoadingScreen: React.FC = () => {
    return (
        <div style={{ 
            height: '100dvh', 
            width: '100vw', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: '#000',
            color: '#fff',
            fontFamily: '"Outfit", "Inter", sans-serif',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 9999
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3.5rem',
                animation: 'fadeIn 0.6s ease-out both'
            }}>
                <div style={{
                    width: '200px',
                    height: 'auto',
                    position: 'relative',
                    animation: 'logoPulse 2.5s ease-in-out infinite'
                }}>
                    <img src={logo} alt="Dary Logo" style={{ width: '100%', height: 'auto', display: 'block' }} />
                </div>
                
                <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: 900, 
                        letterSpacing: '12px', 
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.5)',
                        marginRight: '-12px'
                    }}>ЗАРЕЖДАНЕ</div>
                    <div style={{
                        marginTop: '1.25rem',
                        height: '3px',
                        width: '60px',
                        background: 'var(--primary-color, #00adb5)',
                        margin: '1.25rem auto 0',
                        borderRadius: 'full',
                        animation: 'barLoading 2s ease-in-out infinite'
                    }} />
                </div>
            </div>
            <style>{`
                @keyframes logoPulse { 
                    0%, 100% { transform: scale(1); opacity: 0.85; filter: drop-shadow(0 0 0 rgba(0,173,181,0)); } 
                    50% { transform: scale(1.08); opacity: 1; filter: drop-shadow(0 0 30px rgba(0,173,181,0.4)); } 
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes barLoading { 0% { width: 20px; opacity: 0.2; } 50% { width: 120px; opacity: 1; } 100% { width: 20px; opacity: 0.2; } }
            `}</style>
        </div>
    );
};

export default LoadingScreen;
