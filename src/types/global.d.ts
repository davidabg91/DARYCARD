export {};

declare global {
  interface Window {
    __DARY_NFC_READY__?: boolean;
    onNfcRawEvent?: (tagId: string, url: string) => void;
    webkitAudioContext: typeof AudioContext;
  }
}
