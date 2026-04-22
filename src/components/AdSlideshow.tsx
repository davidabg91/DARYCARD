import React, { useState, useEffect } from 'react';

interface AdSlideshowProps {
    onClose: () => void;
    clientName?: string;
    clientPhoto?: string;
}

const INTERNAL_APP_VERSION = "2026.04.22.04.05";

const AD_IMAGES = [
    {
        url: '/assets/ads/ad_promo.png',
        title: 'DaryCommerce.com',
        description: 'Вашият онлайн портал за абонаменти'
    },
    {
        url: '/assets/ads/ad_scan.png',
        title: 'СКАНИРАЙ ТУК',
        description: 'Поставете картата над екрана за сканиране'
    }
];

const AdSlideshow: React.FC<AdSlideshowProps> = ({ onClose, clientName, clientPhoto }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [imagesLoaded, setImagesLoaded] = useState(false);

    useEffect(() => {
        // Preload the FIRST image quickly to show something as soon as possible
        const preloadFirstImage = () => {
            const img = new Image();
            img.src = `${AD_IMAGES[0].url}?v=${INTERNAL_APP_VERSION}`;
            img.onload = () => setImagesLoaded(true);
            img.onerror = () => setImagesLoaded(true); // Fallback to showing the component anyway
        };
        
        preloadFirstImage();

        // Background preload for the rest
        AD_IMAGES.slice(1).forEach(ad => {
            const img = new Image();
            img.src = `${ad.url}?v=${INTERNAL_APP_VERSION}`;
        });
    }, []);

    useEffect(() => {
        if (!imagesLoaded) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % AD_IMAGES.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [imagesLoaded]);

    if (!imagesLoaded) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50000, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #ff1744', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 50000,
                background: '#000',
                display: 'flex',
                flexDirection: 'column',
                animation: 'fadeIn 0.5s ease',
                willChange: 'opacity'
            }}
            onClick={onClose}
        >
            {/* Ad Content */}
            <div 
                style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#000' }}
            >
                {AD_IMAGES.map((ad, index) => {
                    const isActive = index === currentIndex;
                    return (
                        <div
                            key={index}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: isActive ? 1 : 0,
                                visibility: isActive ? 'visible' : 'hidden',
                                transition: 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1), visibility 1s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: isActive ? 'auto' : 'none',
                                backfaceVisibility: 'hidden',
                                WebkitBackfaceVisibility: 'hidden',
                                transform: 'translate3d(0,0,0)',
                                WebkitTransform: 'translate3d(0,0,0)'
                            }}
                        >
                            {/* Blurred Background - Simplified for mobile performance */}
                            <img 
                                src={`${ad.url}?v=${INTERNAL_APP_VERSION}`} 
                                alt="" 
                                style={{ 
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'cover',
                                    filter: 'blur(20px) brightness(0.2)',
                                    transform: 'scale(1.05)',
                                    opacity: 0.6
                                }} 
                            />
                            
                            {/* Main Ad Image */}
                            <img 
                                className="main-ad-image"
                                src={`${ad.url}?v=${INTERNAL_APP_VERSION}`} 
                                alt={ad.title}
                                style={{ 
                                    position: 'relative',
                                    width: '100%', 
                                    height: '100%', 
                                    zIndex: 1,
                                    boxShadow: '0 0 80px rgba(0,0,0,0.8)',
                                    transform: 'translate3d(0,0,0)',
                                    WebkitTransform: 'translate3d(0,0,0)'
                                }} 
                            />
                        </div>
                    );
                })}
            </div>

            {/* Interaction Hint */}
            <div style={{ position: 'absolute', bottom: '5vh', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', padding: '12px 24px', borderRadius: '30px', color: '#fff', fontSize: '0.9rem', fontWeight: 900, border: '1px solid rgba(255,255,255,0.1)', animation: 'pulse 2s infinite', zIndex: 100 }}>
                ДОКОСНИ ЕКРАНА ЗА ВРЪЩАНЕ
            </div>

            {/* Version and Mini Profile */}
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '10px', opacity: 0.3, zIndex: 100, color: '#fff' }}>v5.10-SYNC-RECOVERY</div>
            
            {clientPhoto && (
                <div style={{ position: 'absolute', top: '4vh', right: '4vh', display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '20px', backdropFilter: 'blur(10px)', zIndex: 100 }}>
                     <img src={clientPhoto} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #00e676' }} alt="Mini Profile" />
                     {clientName && <span style={{ fontWeight: 900, fontSize: '0.8rem', color: '#fff' }}>{clientName.split(' ')[0]}</span>}
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes pulse {
                    0% { opacity: 0.5; transform: translateX(-50%) scale(1); }
                    50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
                    100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
                }
                .main-ad-image {
                    object-fit: contain;
                    max-width: 100%;
                    max-height: 100%;
                }
            `}</style>
        </div>
    );
};

export default AdSlideshow;

