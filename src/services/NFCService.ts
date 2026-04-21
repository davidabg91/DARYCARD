import MyPosSmartSdk from './MyPosSmartSdk';
import { Capacitor } from '@capacitor/core';

export class NFCService {
    static async init(
        onScan: (tagId: string, url?: string) => void,
        onStatusUpdate: (status: string) => void
    ) {
        // ULTIMATE PERSISTENCE: localStorage survives even page reloads
        const nfcState = localStorage.getItem('__DARY_NFC_STATE__');
        
        if (nfcState === 'INITIALIZED' && (window as any).__DARY_NFC_READY__) {
            console.log('🛡️ NFCService: Iron Guard Active. Connection already hot.');
            return;
        }

        (async () => {
            try {
                console.log('⚡ ETERNAL SCANNER: ACTIVATE ⚡');
                localStorage.setItem('__DARY_NFC_STATE__', 'INITIALIZED');
                (window as any).__DARY_NFC_READY__ = true;
                
                if (Capacitor.getPlatform() === 'android') {
                    console.log('NFCService: Binding DaryScanner Hardware...');
                    
                    await MyPosSmartSdk.addListener('nfcEvent', async (event) => {
                        console.log('!!! DARY SCAN RECEIVED !!!', event);
                        if (event.tagId) {
                            onStatusUpdate('КАРТА ПРОЧЕТЕНА!');
                            onScan(event.tagId, event.url);
                        }
                    });

                    await MyPosSmartSdk.startNfcScan();
                    onStatusUpdate('📡 СКЕНЕР ГОТОВ 📡');
                    return; 

                }



            } catch (error: unknown) {
                console.error('NFCService: Eternal Failure', error);
                localStorage.removeItem('__DARY_NFC_STATE__');
            }
        })();
    }

    static async stop() {
        // DISABLED IN IRON GUARD MODE
        console.log('🛡️ NFCService: Stop request denied by Iron Guard.');
    }
}
