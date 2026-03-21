/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    createUserWithEmailAndPassword,
    type User as FirebaseUser
} from 'firebase/auth';
import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    onSnapshot,
    updateDoc,
    deleteDoc,
    query
} from 'firebase/firestore';
import { auth, db } from '../firebase';
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

    useEffect(() => {
        // 1. Listen for Auth State
        const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
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
                        // If user exists in Auth but not in Firestore, create a default entry
                        const newUser = {
                            username: fbUser.email || '',
                            role: 'admin' as UserRole, // Set first user as admin or check if collection is empty
                            createdAt: new Date().toISOString()
                        };
                        await setDoc(doc(db, 'users', fbUser.uid), newUser);
                        setCurrentUser({
                            id: fbUser.uid,
                            username: newUser.username,
                            passwordHash: '',
                            role: newUser.role,
                            createdAt: newUser.createdAt
                        });
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
        // In Firebase, we usually create users via Auth. 
        // For a simple management system, we create them with a dummy email if only username is provided
        const email = username.includes('@') ? username : `${username}@dary.com`;
        
        // Note: This creates the user and SIGNS IN as them. 
        // In a real admin panel, you'd use Firebase Admin SDK or a cloud function.
        // For this simple app, we'll just handle the Firestore part if the user is already created,
        // or let the user handle signups.
        
        // However, for this project, let's assume we use createUserWithEmailAndPassword
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const fbUser = userCredential.user;
        
        await setDoc(doc(db, 'users', fbUser.uid), {
            username: email,
            role,
            createdAt: new Date().toISOString()
        });
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
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};

