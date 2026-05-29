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
