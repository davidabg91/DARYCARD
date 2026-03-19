export type UserRole = 'admin' | 'moderator';

export interface AppUser {
    id: string;
    username: string;
    passwordHash: string; // simple hash for demo
    role: UserRole;
    createdAt: string;
}
