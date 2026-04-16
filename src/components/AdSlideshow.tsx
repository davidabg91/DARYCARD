import React, { useState, useEffect } from 'react';

interface AdSlideshowProps {
    onClose: () => void;
}

const AD_IMAGES = [
    {
        url: '/assets/ads/ad_alps.webp',
        title: 'Езерата на Алпите',
        description: 'Незабравимо пътуване до Сейнт Мориц'
    },
    {
        url: '/assets/ads/ad_riviera.webp',
        title: 'Перлите на Ривиерата',
        description: 'Монако, Ница и Сен Тропе'
    },
    {
        url: '/assets/ads/ad_paris.webp',
        title: 'Магията на Париж',
        description: 'Градът на светлините'
    },
    {
        url: '/assets/ads/ad_kitai.webp',
        title: 'Мистичният Китай',
        description: 'Великата китайска стена и забраненият град'
    }
];

const AdSlideshow: React.FC<AdSlideshowProps> = ({ onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [imagesLoaded, setImagesLoaded] = useState(false);

    useEffect(() => {
        // Preload the FIRST image quickly to show something as soon as possible
        const preloadFirstImage = () => {
            const img = new Image();
            img.src = AD_IMAGES[0].url;
            img.onload = () => setImagesLoaded(true);
            img.onerror = () => setImagesLoaded(true); // Fallback to showing the component anyway
        };
        
        preloadFirstImage();

        // Background preload for the rest
        AD_IMAGES.slice(1).forEach(ad => {
            const img = new Image();
            img.src = ad.url;
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
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                zIndex: 9999,
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
                                src={ad.url} 
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
                                src={ad.url} 
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

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
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
