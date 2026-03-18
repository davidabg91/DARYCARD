import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({ children, className = '', style = {} }) => {
    return (
        <div
            className={`glass ${className}`}
            style={{
                padding: '2rem',
                borderRadius: '16px',
                transition: 'var(--transition-normal)',
                ...style
            }}
        >
            {children}
        </div>
    );
};

export default Card;
