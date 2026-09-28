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

/** Резултатът от печат — `status` е код на PrinterStatus от SDK-а (0 = успех). */
export interface MyPosPrintResult {
  ok: boolean;
  started: boolean;
  status: number;
  message: string;
}

export interface MyPosPrintLine {
  type?: 'TEXT' | 'HEADER' | 'FOOTER' | 'LOGO';
  text?: string;
  align?: 'ALIGN_LEFT' | 'ALIGN_CENTER' | 'ALIGN_RIGHT';
  doubleWidth?: boolean;
  doubleHeight?: boolean;
}

export interface MyPosSmartSdkPlugin {
  startNfcScan(): Promise<void>;
  /** Печат от вградения принтер. Няма го в старите APK-та — викайте го в try/catch. */
  printLines(options: { lines: MyPosPrintLine[] }): Promise<MyPosPrintResult>;
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
