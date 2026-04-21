import { registerPlugin } from '@capacitor/core';

export interface MyPosNfcEvent {
  tagId: string;
  url?: string;
  error?: string;
}

export interface MyPosSmartSdkPlugin {
  startNfcScan(): Promise<void>;
  stopNfcScan(): Promise<void>;
  addListener(eventName: 'nfcEvent', listenerFunc: (event: MyPosNfcEvent) => void): Promise<import('@capacitor/core').PluginListenerHandle>;
  addListener(eventName: 'nfcError', listenerFunc: (event: { error: string }) => void): Promise<import('@capacitor/core').PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// Final unique name for the native lookup
const MyPosSmartSdk = registerPlugin<MyPosSmartSdkPlugin>('DaryScanner');

export default MyPosSmartSdk;
