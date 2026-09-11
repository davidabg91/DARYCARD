import { registerPlugin } from '@capacitor/core';

export interface MyPosNfcEvent {
  tagId: string;
  url?: string;
  error?: string;
  nfcCounter?: number;
}

/** Състоянието на четеца, както го докладва плъгинът. Времената са в милисекунди, 0 = никога. */
export interface MyPosNfcStatus {
  bound: boolean;
  scanning: boolean;
  lastTagAt: number;
  lastError: string;
  lastErrorAt: number;
}

export interface MyPosSmartSdkPlugin {
  startNfcScan(): Promise<void>;
  /** Няма го в старите APK-та — извиквайте го в try/catch. */
  getNfcStatus(): Promise<MyPosNfcStatus>;
  stopNfcScan(): Promise<void>;
  triggerWarningBeep(): Promise<void>;
  addListener(eventName: 'nfcEvent', listenerFunc: (event: MyPosNfcEvent) => void): Promise<import('@capacitor/core').PluginListenerHandle>;
  addListener(eventName: 'nfcError', listenerFunc: (event: { error: string }) => void): Promise<import('@capacitor/core').PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// Final unique name for the native lookup
const MyPosSmartSdk = registerPlugin<MyPosSmartSdkPlugin>('DaryScanner');

export default MyPosSmartSdk;
