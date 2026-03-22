import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Info } from 'lucide-react';

interface AdSlideshowProps {
    onClose: () => void;
}

const AD_IMAGES = [
    {
        url: '/DARYCARD/assets/ads/ad_alps.png',
        title: 'Езерата на Алпите',
        description: 'Незабравимо пътуване до Сейнт Мориц'
    },
    {
        url: '/DARYCARD/assets/ads/ad_riviera.png',
        title: 'Перлите на Ривиерата',
        description: 'Монако, Ница и Сен Тропе'
    },
    {
        url: '/DARYCARD/assets/ads/ad_paris.png',
        title: 'Магията на Париж',
        description: 'Градът на светлините'
    }
];

const AdSlideshow: React.FC<AdSlideshowProps> = ({ onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % AD_IMAGES.length);
        }, 5000); // Change every 5 seconds

        return () => clearInterval(interval);
    }, [isPaused]);

    const nextSlide = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % AD_IMAGES.length);
    };

    const prevSlide = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + AD_IMAGES.length) % AD_IMAGES.length);
    };

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: '#000',
                display: 'flex',
                flexDirection: 'column',
                animation: 'fadeIn 0.5s ease'
            }}
            onClick={onClose}
        >
            {/* Ad Content */}
            <div 
                style={{ position: 'relative', flex: 1, overflow: 'hidden' }}
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
            >
                {AD_IMAGES.map((ad, index) => (
                    <div
                        key={index}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            opacity: index === currentIndex ? 1 : 0,
                            transition: 'opacity 1s ease-in-out',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <img 
                            src={ad.url} 
                            alt={ad.title}
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover',
                                filter: 'brightness(0.7)'
                            }} 
                        />
                        
                        {/* Text Overlay */}
                        <div style={{
                            position: 'absolute',
                            bottom: '10%',
                            left: '5%',
                            right: '5%',
                            textAlign: 'center',
                            animation: index === currentIndex ? 'slideUp 0.8s ease' : 'none'
                        }}>
                            <h2 style={{ 
                                fontSize: '2.5rem', 
                                fontWeight: 900, 
                                marginBottom: '0.5rem', 
                                color: '#fff',
                                textShadow: '0 2px 10px rgba(0,0,0,0.8)'
                            }}>
                                {ad.title}
                            </h2>
                            <p style={{ 
                                fontSize: '1.2rem', 
                                color: 'rgba(255,255,255,0.9)',
                                textShadow: '0 1px 5px rgba(0,0,0,0.8)'
                            }}>
                                {ad.description}
                            </p>
                        </div>
                    </div>
                ))}

                {/* Navigation Arrows */}
                <button 
                    onClick={prevSlide}
                    style={{
                        position: 'absolute',
                        left: '20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,0.3)',
                        border: 'none',
                        borderRadius: '50%',
                        padding: '10px',
                        color: '#fff',
                        cursor: 'pointer',
                        backdropFilter: 'blur(5px)'
                    }}
                >
                    <ChevronLeft size={32} />
                </button>
                <button 
                    onClick={nextSlide}
                    style={{
                        position: 'absolute',
                        right: '20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,0.3)',
                        border: 'none',
                        borderRadius: '50%',
                        padding: '10px',
                        color: '#fff',
                        cursor: 'pointer',
                        backdropFilter: 'blur(5px)'
                    }}
                >
                    <ChevronRight size={32} />
                </button>
            </div>

            {/* Bottom Bar */}
            <div style={{ 
                height: '80px', 
                background: 'var(--primary-color)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '0 2rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Info size={20} color="#fff" />
                    <span style={{ fontWeight: 700, letterSpacing: '1px' }}>DARY COMMERCE - ВАШИЯТ ПЪТНИК</span>
                </div>
                
                <button 
                    onClick={onClose}
                    style={{
                        background: '#fff',
                        color: '#000',
                        border: 'none',
                        padding: '0.5rem 1.5rem',
                        borderRadius: '50px',
                        fontWeight: 900,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <X size={18} /> ЗАТВОРИ РЕКЛАМАТА
                </button>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default AdSlideshow;
