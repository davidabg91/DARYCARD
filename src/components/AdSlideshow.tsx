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
    },
    {
        url: '/DARYCARD/assets/ads/ad_kitai.png',
        title: 'Мистичният Китай',
        description: 'Великата китайска стена и забраненият град'
    }
];

const AdSlideshow: React.FC<AdSlideshowProps> = ({ onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [imagesLoaded, setImagesLoaded] = useState(false);

    useEffect(() => {
        // Preload all images
        const preloadImages = async () => {
            const promises = AD_IMAGES.map(ad => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = ad.url;
                    img.onload = resolve;
                    img.onerror = reject;
                });
            });
            try {
                await Promise.all(promises);
                setImagesLoaded(true);
            } catch (err) {
                console.error("Failed to preload some images", err);
                setImagesLoaded(true); // Proceed anyway after attempt
            }
        };
        preloadImages();
    }, []);

    useEffect(() => {
        if (isPaused || !imagesLoaded) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % AD_IMAGES.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [isPaused, imagesLoaded]);

    if (!imagesLoaded) return null;

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
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
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
