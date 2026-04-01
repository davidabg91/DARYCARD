import logo from '../assets/logo_main.png';

const LoadingScreen: React.FC = () => {
    return (
        <div style={{ 
            height: '100vh', 
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
                gap: '2.5rem',
                animation: 'fadeIn 0.6s ease-out both'
            }}>
                <div style={{
                    width: '120px',
                    height: 'auto',
                    position: 'relative',
                    animation: 'logoPulse 2s ease-in-out infinite'
                }}>
                    <img src={logo} alt="Dary Logo" style={{ width: '100%', height: 'auto', display: 'block' }} />
                </div>
                
                <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 900, 
                        letterSpacing: '8px', 
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.4)',
                        marginRight: '-8px' // Compensation for the last letter-spacing
                    }}>ЗАРЕЖДАНЕ</div>
                    <div style={{
                        marginTop: '0.75rem',
                        height: '2px',
                        width: '40px',
                        background: 'var(--primary-color, #00adb5)',
                        margin: '0.75rem auto 0',
                        borderRadius: 'full',
                        animation: 'barLoading 1.5s ease-in-out infinite'
                    }} />
                </div>
            </div>
            <style>{`
                @keyframes logoPulse { 
                    0%, 100% { transform: scale(1); opacity: 0.8; filter: drop-shadow(0 0 0 rgba(0,173,181,0)); } 
                    50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 20px rgba(0,173,181,0.3)); } 
                }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes barLoading { 0% { width: 10px; opacity: 0.2; } 50% { width: 60px; opacity: 1; } 100% { width: 10px; opacity: 0.2; } }
            `}</style>
        </div>
    );
};

export default LoadingScreen;
