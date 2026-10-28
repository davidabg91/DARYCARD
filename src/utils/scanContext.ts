import { Capacitor } from '@capacitor/core';
import { serverTimestamp } from 'firebase/firestore';
import { appVersionInUse, getDeviceId } from './deviceHeartbeat';
import { currentFix } from './vehiclePosition';

/**
 * Какво още носи записът на едно сканиране освен часа и линията.
 *
 * Терминалът казва кой е (номерът му в УСТРОЙСТВА), с коя версия върви и къде
 * е бил автобусът — последната GPS точка, ако е отпреди най-много минута.
 * Сървърът после добавя името на апарата, селото и спирката
 * (attributeScanToDevice), за да се вижда в историята на картата и в отчета
 * „без абонамент“ на кой апарат е сканирана.
 *
 * Браузърът казва само, че е браузър, и какъв — телефон или компютър. Иначе
 * карта, отворена на телефона на пътника, изглежда като качване в автобус.
 *
 * `serverAt` е часът на сървъра: по него се вижда колко е сбъркан часовникът на
 * терминала и колко е чакал записът без връзка. Не може да влезе в масив
 * (arrayUnion) — там се пише `scanContext(false)`.
 */

/** GPS точка по-стара от това не казва къде е картата — автобусът е тръгнал. */
const FIX_MAX_AGE_MS = 60 * 1000;

const describeBrowser = (): string => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const os = /iPhone|iPad/.test(ua) ? 'iPhone'
        : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? 'Mac'
        : /Linux/.test(ua) ? 'Linux' : '';
    const browser = /SamsungBrowser/.test(ua) ? 'Samsung'
        : /Edg\//.test(ua) ? 'Edge'
        : /OPR\//.test(ua) ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
        : /CriOS|Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : '';
    return [os, browser].filter(Boolean).join(' · ') || 'браузър';
};

export const scanContext = (withServerTime = true): Record<string, unknown> => {
    const out: Record<string, unknown> = withServerTime ? { serverAt: serverTimestamp() } : {};
    if (!Capacitor.isNativePlatform()) {
        out.source = 'web';
        out.browser = describeBrowser();
        return out;
    }
    const deviceId = getDeviceId();
    if (deviceId) out.deviceId = deviceId;
    const app = appVersionInUse();
    if (app) out.app = app;
    const fix = currentFix(FIX_MAX_AGE_MS);
    if (fix) {
        out.lat = fix.lat;
        out.lng = fix.lng;
        if (fix.accuracy !== null) out.acc = fix.accuracy;
        out.gpsAgeS = Math.round(fix.ageMs / 1000);
    }
    return out;
};
