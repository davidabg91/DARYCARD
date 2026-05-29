/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    type User as FirebaseUser
} from 'firebase/auth';
import {
    doc,
    getDoc,
    collection,
    onSnapshot,
    updateDoc,
    deleteDoc,
    query
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { auth, db } from '../firebase';
import type { AppUser, UserRole } from '../types/auth';

interface AuthContextType {
    currentUser: AppUser | null;
    users: AppUser[];
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    addUser: (email: string, password: string, role: UserRole) => Promise<void>;
    updateUserRole: (userId: string, role: UserRole) => Promise<void>;
    deleteUser: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const loadingRef = React.useRef(loading);
    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        // Safety timeout: stop loading after 10 seconds even if Firebase hasn't responded
        const safetyTimeout = setTimeout(() => {
            if (loadingRef.current) {
                console.warn('Authentication check timed out. Firebase might be blocked by a proxy or network issue.');
                setLoading(false);
            }
        }, 10000);

        // 1. Listen for Auth State
        const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
            clearTimeout(safetyTimeout);
            setLoading(true);
            try {
                if (fbUser) {
                    // Get user role from Firestore
                    const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        setCurrentUser({
                            id: fbUser.uid,
                            username: fbUser.email || '',
                            passwordHash: '', // Not needed for Firebase
                            role: data.role as UserRole,
                            createdAt: data.createdAt || new Date().toISOString()
                        });
                    } else {
                        // User exists in Auth but not in Firestore - no default role anymore
                        // This prevents unauthorized sign-ups from gaining access
                        console.warn(`User ${fbUser.email} logged in but has no Firestore profile. Access will be restricted.`);
                        setCurrentUser(null);
                    }
                } else {
                    setCurrentUser(null);
                }
            } catch (error) {
                console.error("Error in onAuthStateChanged:", error);
            } finally {
                setLoading(false);
            }
        });

        // 2. Listen for all users
        const q = query(collection(db, 'users'));
        const unsubscribeUsers = onSnapshot(q, (snapshot) => {
            const userList: AppUser[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                userList.push({
                    id: doc.id,
                    username: data.username || '',
                    passwordHash: '',
                    role: data.role as UserRole,
                    createdAt: data.createdAt || ''
                });
            });
            setUsers(userList);

            // AUTO-MIGRATION of default admin if users collection is empty
            if (snapshot.empty) {
                console.log('No users found. You should register your first admin account.');
            }
        });

        return () => {
            unsubscribeAuth();
            unsubscribeUsers();
        };
    }, []);

    const login = async (email: string, password: string) => {
        const emailToLogin = email.includes('@') ? email : `${email}@dary.com`;
        await signInWithEmailAndPassword(auth, emailToLogin, password);
    };

    const logout = async () => {
        await signOut(auth);
    };

    const addUser = async (username: string, password: string, role: UserRole) => {
        // Created via the createStaffUser Cloud Function (Admin SDK). This keeps the
        // current admin signed in (the client SDK's createUserWithEmailAndPassword
        // would switch the active session to the new user) and lets Firestore rules
        // keep `users` writes admin-only.
        const email = username.includes('@') ? username : `${username}@dary.com`;
        const fns = getFunctions(app);
        const createStaffUser = httpsCallable(fns, 'createStaffUser');
        await createStaffUser({ email, password, role });
    };

    const updateUserRole = async (userId: string, role: UserRole) => {
        await updateDoc(doc(db, 'users', userId), { role });
    };

    const deleteUser = async (userId: string) => {
        // We can't easily delete from Auth without Admin SDK, but we can remove from Firestore database
        await deleteDoc(doc(db, 'users', userId));
    };

    return (
        <AuthContext.Provider value={{ currentUser, users, loading, login, logout, addUser, updateUserRole, deleteUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};

