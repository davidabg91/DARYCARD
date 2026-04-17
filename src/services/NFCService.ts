import { CapacitorNfc } from '@capgo/capacitor-nfc';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export class NFCService {
    private static isInitialized = false;

    static async init(
        onScan: (tagId: string) => void,
        onStatusUpdate: (status: string) => void
    ) {
        if (this.isInitialized) return;

        try {
            onStatusUpdate('ОПИТ ЗА NFC...');
            
            // Bypass the isSupported check because some POS terminals report false 
            // even when hardware is present and accessible via direct scan.
            const { supported } = await CapacitorNfc.isSupported();
            console.log('NFC Support reported:', supported);
            
            // Still report if supported, but DON'T RETURN. Proceed anyway.
            if (!supported) {
                console.warn('NFC reported as unsupported, but attempting force start...');
            }

            // Listen for NFC events
            await CapacitorNfc.addListener('nfcEvent', async (event) => {
                console.log('NFC Event received:', event);
                
                if (event.tag && event.tag.id) {
                    // Physical feedback (Vibration)
                    await Haptics.impact({ style: ImpactStyle.Heavy });
                    
                    const tagId = event.tag.id.map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
                    console.log('Detected Tag ID:', tagId);
                    
                    onStatusUpdate('КНИГА ПРОЧЕТЕНА!');
                    setTimeout(() => onStatusUpdate('NFC: ГОТОВНОСТ'), 2000);
                    
                    onScan(tagId);
                }
            });

            // Start scanning session
            await CapacitorNfc.startScanning({
                invalidateAfterFirstRead: false,
            });

            this.isInitialized = true;
            onStatusUpdate('NFC: ГОТОВНОСТ');
            console.log('NFC Service Initialized Successfully');
        } catch (error: any) {
            const errorMsg = error.message || error.toString() || 'Unknown error';
            onStatusUpdate('NFC ГРЕШКА: ' + errorMsg);
            console.error('Error initializing NFC Service:', error);
        }
    }

    static async stop() {
        if (!this.isInitialized) return;
        try {
            await CapacitorNfc.stopScanning();
            this.isInitialized = false;
        } catch (error) {
            console.error('Error stopping NFC Service:', error);
        }
    }
}
