import React, { useState } from 'react';

interface ClientPhotoProps {
    /** Full-resolution photo (Firebase Storage URL, or a legacy data: URL). */
    src?: string;
    /** Tiny inline base64 placeholder shown instantly and offline. */
    thumb?: string;
    alt?: string;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * Shows the tiny inline `thumb` (which travels inside the cached Firestore
 * document, so it renders instantly and works fully offline) as the background,
 * then loads the full-resolution `src` on top. If `src` fails to load — e.g. the
 * driver is in a dead zone and this photo isn't cached yet — the thumbnail stays
 * visible instead of a broken image. Once a photo has loaded online it is also
 * cached by the service worker, so later scans are instant offline too.
 */
const ClientPhoto: React.FC<ClientPhotoProps> = ({ src, thumb, alt, style, className }) => {
    const [failed, setFailed] = useState(false);

    // Reset the error state when the photo changes (e.g. a new card is scanned).
    // Done during render (not in an effect) per React's derived-state pattern.
    const [prevSrc, setPrevSrc] = useState(src);
    if (src !== prevSrc) {
        setPrevSrc(src);
        setFailed(false);
    }

    return (
        <div
            className={className}
            style={{
                ...style,
                backgroundImage: thumb ? `url("${thumb}")` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                overflow: 'hidden',
            }}
        >
            {src && !failed && (
                <img
                    src={src}
                    alt={alt}
                    onError={() => setFailed(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
            )}
        </div>
    );
};

export default ClientPhoto;
