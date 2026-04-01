import React from 'react';

const LoadingScreen: React.FC = () => {
    return (
        <div style={{ 
            height: '100vh', 
            width: '100vw', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'var(--bg-color, #1a1a1a)',
            color: '#fff',
            fontFamily: 'Inter, sans-serif',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 9999
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                animation: 'fadeIn 0.5s ease-out 0.25s both' // Added 0.25s delay
            }}>
                <div style={{
                    width: '50px',
                    height: '50px',
                    border: '3px solid rgba(255, 82, 82, 0.1)',
                    borderTop: '3px solid #ff5252',
                    borderRadius: '50%',
                    animation: 'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    marginBottom: '0.5rem'
                }} />
                <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                        fontSize: '0.9rem', 
                        fontWeight: 900, 
                        letterSpacing: '4px', 
                        textTransform: 'uppercase',
                        color: '#ff5252',
                        opacity: 0.9,
                        marginBottom: '4px'
                    }}>DARY SYSTEM</div>
                    <div style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 700, 
                        letterSpacing: '6px', 
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.4)',
                        animation: 'pulse 1.5s ease-in-out infinite'
                    }}>ЗАРЕЖДАНЕ</div>
                </div>
            </div>
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.6; } }
            `}</style>
        </div>
    );
};

export default LoadingScreen;
