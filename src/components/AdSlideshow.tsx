import React, { useState, useEffect } from 'react';

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
                        {/* Blurred Background */}
                        <img 
                            src={ad.url} 
                            alt="" 
                            style={{ 
                                position: 'absolute',
                                inset: 0,
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover',
                                filter: 'blur(30px) brightness(0.3)',
                                transform: 'scale(1.1)'
                            }} 
                        />
                        
                        {/* Main Ad Image */}
                        <img 
                            src={ad.url} 
                            alt={ad.title}
                            style={{ 
                                position: 'relative',
                                maxWidth: '100%', 
                                maxHeight: '100%', 
                                objectFit: 'contain',
                                zIndex: 1,
                                boxShadow: '0 0 100px rgba(0,0,0,0.5)'
                            }} 
                        />
                    </div>
                ))}
            </div>

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
