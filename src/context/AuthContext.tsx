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

/** Последно потвърдената от сървъра роля, за да не чака студеният старт Firestore.
 *  Пази се само за текущата сесия (по uid) и се чисти при изход. Не е защита —
 *  правилата на Firestore четат ролята от `users/<uid>` при всяка заявка. */
const ROLE_CACHE_KEY = 'dary_role_cache';

const readCachedRole = (uid: string): AppUser | null => {
    try {
        const raw = localStorage.getItem(ROLE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AppUser;
        return parsed && parsed.id === uid && parsed.role ? parsed : null;
    } catch {
        return null;
    }
};

const writeCachedRole = (user: AppUser) => {
    try {
        localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(user));
    } catch { /* частен режим или пълно хранилище — не е критично */ }
};

const clearCachedRole = () => {
    try {
        localStorage.removeItem(ROLE_CACHE_KEY);
    } catch { /* ignore */ }
};

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
        // Ролята се чете с `onSnapshot`, а не с `getDoc`. Първото събитие идва от
        // постоянния кеш (мигновено, работи и офлайн), второто — от сървъра. Преди
        // това всеки студен старт чакаше цяла обиколка до Firestore, преди да се
        // разбере кой е логнат: на телефон това са секунди, в които приложението
        // изглежда нелогнато. Записването на сканиране изчаква точно този момент
        // (`authLoading` в TransitView и ClientProfile), затова бавният отговор
        // маркираше офисните прочитания като анонимни.
        let unsubscribeRole: (() => void) | null = null;

        // Авариен изход: ако Firebase не отговори, спираме въртележката — но само
        // когато наистина няма сесия. Иначе логнат потребител попадаше на екрана за
        // вход (ProtectedRoute праща към /login при `!currentUser`).
        const safetyTimeout = setTimeout(() => {
            if (loadingRef.current && !auth.currentUser) {
                console.warn('Authentication check timed out. Firebase might be blocked by a proxy or network issue.');
                setLoading(false);
            }
        }, 10000);

        // 1. Listen for Auth State
        const unsubscribeAuth = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
            unsubscribeRole?.();
            unsubscribeRole = null;

            if (!fbUser) {
                clearTimeout(safetyTimeout);
                clearCachedRole();
                setCurrentUser(null);
                setLoading(false);
                return;
            }

            // Последно потвърдената роля за тази сесия — показва се веднага, докато
            // Firestore потвърди. Не е защита: достъпът до данни минава през
            // правилата, които четат `users/<uid>.role` на сървъра.
            const cached = readCachedRole(fbUser.uid);
            if (cached) {
                clearTimeout(safetyTimeout);
                setCurrentUser(cached);
                setLoading(false);
            }

            unsubscribeRole = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const appUser: AppUser = {
                        id: fbUser.uid,
                        username: data.username || fbUser.email || '',
                        passwordHash: '', // Not needed for Firebase
                        role: data.role as UserRole,
                        createdAt: data.createdAt || new Date().toISOString(),
                        lastSeen: data.lastSeen || ''
                    };
                    clearTimeout(safetyTimeout);
                    setCurrentUser(appUser);
                    setLoading(false);
                    if (!snap.metadata.fromCache) {
                        writeCachedRole(appUser);
                        // Best-effort "last seen" stamp, само при потвърждение от сървъра.
                        updateDoc(doc(db, 'users', fbUser.uid), { lastSeen: new Date().toISOString() })
                            .catch(() => { /* rules or offline — ignore */ });
                    }
                } else if (!snap.metadata.fromCache) {
                    // Потвърдено от сървъра: има акаунт в Auth, но няма профил в
                    // Firestore — без роля, без достъп. Празен кеш не значи нищо,
                    // затова тогава просто чакаме сървъра.
                    console.warn(`User ${fbUser.email} logged in but has no Firestore profile. Access will be restricted.`);
                    clearTimeout(safetyTimeout);
                    clearCachedRole();
                    setCurrentUser(null);
                    setLoading(false);
                }
            }, (error) => {
                console.error("Error reading the user profile:", error);
                clearTimeout(safetyTimeout);
                setLoading(false);
            });
        });

        return () => {
            clearTimeout(safetyTimeout);
            unsubscribeAuth();
            unsubscribeRole?.();
        };
    }, []);

    // Списъкът със служители е нужен само на вписани потребители (ПОТРЕБИТЕЛИ и
    // проверките), а правилата го дават само на вписани. Докато беше закачен
    // безусловно, всяко публично отваряне на карта вдигаше отказана заявка на
    // същата връзка — точно докато профилът се зарежда на терминала.
    useEffect(() => {
        if (!currentUser) return;
        const unsubscribeUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
            const userList: AppUser[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                userList.push({
                    id: docSnap.id,
                    username: data.username || '',
                    passwordHash: '',
                    role: data.role as UserRole,
                    createdAt: data.createdAt || '',
                    lastSeen: data.lastSeen || ''
                });
            });
            setUsers(userList);
        }, (error) => console.error('Users listener error:', error));
        // Изчистване при изход, за да не остава списъкът на общ компютър.
        return () => { unsubscribeUsers(); setUsers([]); };
    }, [currentUser]);

    const login = async (email: string, password: string) => {
        const emailToLogin = email.includes('@') ? email : `${email}@dary.com`;
        await signInWithEmailAndPassword(auth, emailToLogin, password);
    };

    const logout = async () => {
        clearCachedRole();
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

