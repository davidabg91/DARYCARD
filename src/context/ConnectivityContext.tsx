/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface ConnectivityContextType {
    isOnline: boolean;
    checkNow: () => Promise<boolean>;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // 📡 THE SMART PING: High-entropy HEAD request to bypass all proxies
    const performPing = useCallback(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
            const entropy = Math.random().toString(36).substring(7);
            const res = await fetch(`/version.json?t=${Date.now()}&e=${entropy}`, {
                method: 'HEAD',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const status = res.ok;
            setIsOnline(status);
            return status;
        } catch {
            clearTimeout(timeoutId);
            setIsOnline(false);
            return false;
        }
    }, []);

    const checkNow = useCallback(async () => {
        return await performPing();
    }, [performPing]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            performPing(); // Double check
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Slow heartbeat: 60 seconds to save battery/data
        const interval = setInterval(performPing, 60000);

        // Initial check
        performPing();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [performPing]);

    return (
        <ConnectivityContext.Provider value={{ isOnline, checkNow }}>
            {children}
        </ConnectivityContext.Provider>
    );
};

export const useConnectivity = () => {
    const context = useContext(ConnectivityContext);
    if (context === undefined) {
        throw new Error('useConnectivity must be used within a ConnectivityProvider');
    }
    return context;
};
