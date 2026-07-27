export type UserRole = 'admin' | 'moderator' | 'inspector';

export interface AppUser {
    id: string;
    username: string;
    passwordHash: string; // simple hash for demo
    role: UserRole;
    createdAt: string;
    lastSeen?: string; // ISO timestamp of the user's last app load / login
}
