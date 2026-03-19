/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';

import type { AppUser, UserRole } from '../types/auth';

interface AuthContextType {
    currentUser: AppUser | null;
    users: AppUser[];
    login: (username: string, password: string) => boolean;
    logout: () => void;
    addUser: (username: string, password: string, role: UserRole) => boolean;
    updateUserRole: (userId: string, role: UserRole) => void;
    deleteUser: (userId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Simple non-cryptographic hash (for demo/local use only)
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36);
}

const DEFAULT_ADMIN: AppUser = {
    id: 'default-admin',
    username: 'admin',
    passwordHash: simpleHash('admin123'),
    role: 'admin',
    createdAt: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

    useEffect(() => {
        let stored: AppUser[] = JSON.parse(localStorage.getItem('dary_users') || '[]');
        
        // Ensure default admin exists and has latest credentials
        const existingAdmin = stored.find(u => u.id === 'default-admin');
        if (!existingAdmin) {
            stored = [DEFAULT_ADMIN, ...stored];
        } else {
            // Force update password hash and role just in case of stale cache
            stored = stored.map(u => u.id === 'default-admin' 
                ? { ...u, username: DEFAULT_ADMIN.username, passwordHash: DEFAULT_ADMIN.passwordHash, role: 'admin' } 
                : u);
        }

        localStorage.setItem('dary_users', JSON.stringify(stored));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUsers(stored);

        const sessionUser = localStorage.getItem('dary_session');
        if (sessionUser) {
            const parsed = JSON.parse(sessionUser) as AppUser;
            const found = stored.find(u => u.id === parsed.id);
            if (found) setCurrentUser(found);
        }
    }, []);

    const saveUsers = (updated: AppUser[]) => {
        localStorage.setItem('dary_users', JSON.stringify(updated));
        setUsers(updated);
    };

    const login = (username: string, password: string): boolean => {
        const hash = simpleHash(password);
        const normalizedUsername = username.trim().toLowerCase();
        
        // Use current state users, but fallback to localStorage directly 
        // if state is empty to prevent race conditions during initialization
        let userList = users;
        if (userList.length === 0) {
            userList = JSON.parse(localStorage.getItem('dary_users') || '[]');
            // Ensure default admin is at least in the local list if it's still empty
            if (userList.length === 0) userList = [DEFAULT_ADMIN];
        }

        const user = userList.find(u => 
            u.username.toLowerCase() === normalizedUsername && 
            u.passwordHash === hash
        );

        if (user) {
            setCurrentUser(user);
            localStorage.setItem('dary_session', JSON.stringify(user));
            return true;
        }
        return false;
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('dary_session');
    };

    const addUser = (username: string, password: string, role: UserRole): boolean => {
        if (users.find(u => u.username === username)) return false;
        const newUser: AppUser = {
            id: Math.random().toString(36).slice(2),
            username,
            passwordHash: simpleHash(password),
            role,
            createdAt: new Date().toISOString(),
        };
        saveUsers([...users, newUser]);
        return true;
    };

    const updateUserRole = (userId: string, role: UserRole) => {
        const updated = users.map(u => u.id === userId ? { ...u, role } : u);
        saveUsers(updated);
        if (currentUser?.id === userId) {
            const refreshed = { ...currentUser, role };
            setCurrentUser(refreshed);
            localStorage.setItem('dary_session', JSON.stringify(refreshed));
        }
    };

    const deleteUser = (userId: string) => {
        if (currentUser?.role !== 'admin') return; // only admins can delete
        if (userId === 'default-admin') return; // protect default admin
        saveUsers(users.filter(u => u.id !== userId));
    };

    return (
        <AuthContext.Provider value={{ currentUser, users, login, logout, addUser, updateUserRole, deleteUser }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};
