import React, { useState, useEffect } from 'react';
import adPromo from '../assets/ads/ad_promo.png';
import adScan from '../assets/ads/ad_scan.png';

interface AdSlideshowProps {
    onClose: () => void;
    clientName?: string;
    clientPhoto?: string;
}

const AD_IMAGES = [
    {
        url: adPromo,
        title: 'DaryCommerce.com'
    },
    {
        url: adScan,
        title: 'СКАНИРАЙ ТУК'
    }
];

const AdSlideshow: React.FC<AdSlideshowProps> = ({ onClose, clientName, clientPhoto }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % AD_IMAGES.length);
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                background: '#000',
                display: 'flex',
                flexDirection: 'column',
                animation: 'fadeIn 0.5s ease'
            }}
            onClick={onClose}
        >
            {/* Ad Content */}
            <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                {AD_IMAGES.map((ad, index) => {
                    const isActive = index === currentIndex;
                    return (
                        <div
                            key={index}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: isActive ? 1 : 0,
                                transition: 'opacity 1s ease-in-out',
                                background: `url(${ad.url}) center center / contain no-repeat`,
                                backgroundColor: '#000'
                            }}
                        />
                    );
                })}
            </div>

            {/* Interaction Hint */}
            <div style={{ position: 'absolute', bottom: '5vh', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', padding: '12px 24px', borderRadius: '30px', color: '#fff', fontSize: '0.9rem', fontWeight: 900, border: '1px solid rgba(255,255,255,0.1)', zIndex: 100 }}>
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
            `}</style>
        </div>
    );
};

export default AdSlideshow;

