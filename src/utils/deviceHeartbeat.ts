// Регистър на устройствата, които работят с приложението.
//
// Всеки терминал се вписва сам в `devices/{deviceId}` и оттам нататък праща
// пулс: жив ли е, на колко процента е батерията, коя версия носи и кога за
// последно е сканирал карта. Шофьорите НЕ се логват, затова записът е анонимен —
// правилата пускат само този тесен списък полета (`name` се пише само от служител,
// за да не може устройство да си презапише името, което админът му е дал).
//
// Само в нативното приложение. Браузър или PWA не се вписва — иначе списъкът се
// запълва с телефоните на всеки, който е отварял сайта.

import { Capacitor } from '@capacitor/core';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import MyPosSmartSdk from '../services/MyPosSmartSdk';
import { captureDeviceErrors } from './deviceErrors';

const DEVICE_ID_KEY = 'dary_device_id';
const SCAN_COUNT_PREFIX = 'dary_device_scans_';

/** През колко време устройството се обажда. */
export const HEARTBEAT_MS = 2 * 60 * 1000;

/** След колко мълчание го водим „не е на линия". Три пропуснати пулса. */
export const OFFLINE_AFTER_MS = 6 * 60 * 1000;

/** Под този процент батерията се брои за проблем. */
export const LOW_BATTERY = 20;

export interface DeviceDoc {
    deviceId: string;
    /** Името, което админът е дал — обикновено шофьорът. */
    name?: string;
    /** Каквото устройството е разпознало за себе си, докато няма име. */
    autoName?: string;
    firstSeen?: string;
    lastSeen?: string;
    appVersion?: string;
    platform?: string;
    userAgent?: string;
    batteryLevel?: number | null;
    batteryCharging?: boolean | null;
    batteryAt?: string | null;
    lastScanAt?: string;
    scansToday?: number;
    scanDate?: string;
    /** Здраве на NFC четеца, както го докладва нативният плъгин. */
    nfcBound?: boolean | null;
    nfcScanning?: boolean | null;
    nfcLastTagAt?: string | null;
    nfcLastError?: string | null;
    nfcLastErrorAt?: string | null;
}

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Устойчив номер на устройството. Живее в localStorage, значи преживява
 * рестарт и нова версия на приложението, но НЕ и изтриване на данните —
 * тогава устройството се появява като ново и старият ред трябва да се махне
 * на ръка.
 */
export const getDeviceId = (): string => {
    try {
        const existing = localStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
        const raw = crypto?.randomUUID?.()
            ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        const id = raw.replace(/-/g, '').slice(0, 20).toUpperCase();
        localStorage.setItem(DEVICE_ID_KEY, id);
        return id;
    } catch {
        return '';   // забранен localStorage — тогава просто не се вписваме
    }
};

/** Човешко име по подразбиране: моделът от User-Agent, ако се разчете. */
const describeDevice = (): string => {
    const ua = navigator.userAgent || '';
    const match = ua.match(/Android[^;]*;\s*([^;)]+)/);
    const model = match?.[1]?.trim();
    return model && model.length > 1 ? model : 'Устройство';
};

/**
 * Пита нативния плъгин как е четецът. Старите APK-та нямат този метод — тогава
 * се връща null и екранът просто не показва нищо за NFC, вместо да лъже.
 */
const readNfcStatus = async (): Promise<Partial<DeviceDoc>> => {
    try {
        const s = await MyPosSmartSdk.getNfcStatus();
        return {
            nfcBound: !!s.bound,
            nfcScanning: !!s.scanning,
            nfcLastTagAt: s.lastTagAt ? new Date(s.lastTagAt).toISOString() : null,
            nfcLastError: s.lastError || null,
            nfcLastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : null,
        };
    } catch {
        return {};
    }
};

interface BatteryLike {
    level: number;
    charging: boolean;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
}

const readBattery = async (): Promise<BatteryLike | null> => {
    const nav = navigator as unknown as { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery !== 'function') return null;
    try {
        return await nav.getBattery();
    } catch {
        return null;   // някои браузъри го имат, но отказват
    }
};

/** Брои сканиранията за деня в localStorage, за да не се чете документът. */
const bumpScanCount = (): number => {
    const key = SCAN_COUNT_PREFIX + todayStr();
    try {
        const next = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
        localStorage.setItem(key, String(next));
        // Вчерашните ключове не са ни нужни.
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith(SCAN_COUNT_PREFIX) && k !== key) localStorage.removeItem(k);
        }
        return next;
    } catch {
        return 1;
    }
};

/**
 * Записва промяната. Първо пробва update — ако документът още го няма,
 * Firestore връща грешка и тогава го създаваме с пълните полета. Така
 * устройството никога не чете от базата, значи и правилата не трябва да му
 * дават четене.
 */
const writeDevice = async (id: string, patch: Record<string, unknown>, appVersion: string) => {
    const ref = doc(db, 'devices', id);
    try {
        await updateDoc(ref, patch);
    } catch {
        try {
            await setDoc(ref, {
                deviceId: id,
                firstSeen: nowIso(),
                autoName: describeDevice(),
                platform: Capacitor.getPlatform(),
                userAgent: (navigator.userAgent || '').slice(0, 300),
                appVersion,
                ...patch,
            });
        } catch (err) {
            console.error('Устройството не се вписа в регистъра:', err);
        }
    }
};

/**
 * Пуска пулса. Връща функция за спиране.
 * Вика се веднъж, при качването на приложението.
 */
export const startDeviceHeartbeat = (appVersion: string): (() => void) => {
    if (!Capacitor.isNativePlatform()) return () => { };
    const id = getDeviceId();
    if (!id) return () => { };

    let stopped = false;
    let battery: BatteryLike | null = null;

    const beat = () => {
        if (stopped) return;
        void readNfcStatus().then(nfc => {
            if (stopped) return;
            void writeDevice(id, {
                lastSeen: nowIso(),
                appVersion,
                batteryLevel: battery ? Math.round(battery.level * 100) : null,
                batteryCharging: battery ? battery.charging : null,
                batteryAt: battery ? nowIso() : null,
                ...nfc,
            }, appVersion);
        });
    };

    void readBattery().then(b => {
        battery = b;
        if (b && !stopped) {
            // Празна батерия или включен кабел — казваме го веднага, не след две минути.
            b.addEventListener?.('levelchange', beat);
            b.addEventListener?.('chargingchange', beat);
        }
        beat();
    });

    const stopCapture = captureDeviceErrors(id, appVersion);
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', beat);

    return () => {
        stopped = true;
        stopCapture();
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', beat);
        battery?.removeEventListener?.('levelchange', beat);
        battery?.removeEventListener?.('chargingchange', beat);
    };
};

/** Отбелязва, че това устройство току-що е прочело карта. */
export const recordDeviceScan = (appVersion: string): void => {
    if (!Capacitor.isNativePlatform()) return;
    const id = getDeviceId();
    if (!id) return;
    void writeDevice(id, {
        lastSeen: nowIso(),
        lastScanAt: nowIso(),
        scanDate: todayStr(),
        scansToday: bumpScanCount(),
    }, appVersion);
};
