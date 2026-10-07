import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Uploads a (compressed) JPEG data URL to Firebase Storage and returns its public
 * download URL. Photos are keyed by client id so a re-upload overwrites the old file.
 *
 * Storing the URL (a short string) in the client document — instead of the full
 * base64 image — keeps the `clients` collection small, so the real-time listeners
 * used across the admin panels download far less data. Read sites are unchanged:
 * <img src={client.photo}> works for both a Storage URL and a legacy data: URL.
 */
export async function uploadClientPhoto(dataUrl: string, clientId: string): Promise<string> {
    const storageRef = ref(storage, `client_photos/${clientId}.jpg`);
    await uploadString(storageRef, dataUrl, 'data_url');
    return getDownloadURL(storageRef);
}

/**
 * Short, storable reason for a failed upload (e.g. "storage/unauthorized"). The
 * registration paths fall back to the inline base64 image when the upload fails,
 * and that fallback is silent — from 28.09.2026 every new registration took it for
 * days before anyone noticed the clients collection had doubled. Writing the reason
 * into the client document makes the next failure diagnosable from the database.
 */
export function describeUploadError(err: unknown): string {
    const e = err as { code?: string; message?: string; status_?: number } | null;
    const parts = [e?.code, e?.status_ ? `HTTP ${e.status_}` : '', e?.message || String(err)].filter(Boolean);
    return `${new Date().toISOString()} ${parts.join(' | ')}`.slice(0, 500);
}
