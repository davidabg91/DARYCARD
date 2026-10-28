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
import { doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import MyPosSmartSdk from '../services/MyPosSmartSdk';
import { captureDeviceErrors } from './deviceErrors';
import { startPositionReport } from './vehiclePosition';
import { startCardListSync } from './offlineCards';

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
    /**
     * Часът на сървъра при същия запис като `lastSeen`. Разликата между двата е
     * колко бърза или изостава часовникът на терминала — на ръка сверен
     * терминал не минава на зимно време и бърза с час.
     */
    serverSeen?: Timestamp | null;
    appVersion?: string;
    platform?: string;
    userAgent?: string;
    batteryLevel?: number | null;
    batteryCharging?: boolean | null;
    batteryAt?: string | null;
    lastScanAt?: string;
    scansToday?: number;
    scanDate?: string;
    /**
     * Линията, която терминалът обслужва в момента. НЕ я пише устройството —
     * пише я Cloud Function-ът `attributeScanToDevice`, който връзва сканиране
     * с терминал по време. Стойността е най-честата линия сред прочетените днес
     * карти: картата носи своята линия, не тази на автобуса, затова единичен
     * пътник с чужда карта не бива да мести показанието.
     */
    currentRoute?: string;
    currentRouteAt?: string;
    /** Колко от днешните карти сочат тази линия — мярка за увереност. */
    currentRouteScans?: number;
    /** Здраве на NFC четеца, както го докладва нативният плъгин. */
    nfcBound?: boolean | null;
    nfcScanning?: boolean | null;
    nfcLastTagAt?: string | null;
    nfcLastError?: string | null;
    nfcLastErrorAt?: string | null;
    /** Номерът на терминала в myPOS — отпечатан на апарата (от APK 1.4.5 нататък). */
    tid?: string;
    /** ANDROID_ID — същият при преинсталиране; по него ново инсталиране взима старото име. */
    hwId?: string;
    /** Новото инсталиране на същия апарат, което е поело името (пише го функцията). */
    replacedBy?: string;
}

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Версията, с която върви приложението — за записа на сканирането. */
let runningVersion = '';
export const appVersionInUse = (): string => runningVersion;

/** Кой е апаратът по хардуер (DaryNfcPlugin.getDeviceIdentity); няма го в старите APK-та. */
interface DeviceIdentity { tid: string; hwId: string }

const readIdentity = async (): Promise<DeviceIdentity | null> => {
    try {
        const r = await MyPosSmartSdk.getDeviceIdentity();
        const clean = (x: unknown) => String(x || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
        return { tid: clean(r.tid), hwId: clean(r.androidId) };
    } catch {
        return null;   // старо APK — методът го няма
    }
};

/**
 * Номерът на устройството в УСТРОЙСТВА. Пази се в localStorage, значи преживява
 * рестарт и нова версия на приложението; всяко сканиране го носи (scanContext),
 * затова апаратът на сканирането е сигурен.
 *
 * Връща празно, докато номерът още не е избран — първите мигове на първото
 * пускане. Иначе случаен номер би изпреварил хардуерния.
 */
export const getDeviceId = (): string => {
    try {
        return localStorage.getItem(DEVICE_ID_KEY) || '';
    } catch {
        return '';   // забранен localStorage — тогава просто не се вписваме
    }
};

/**
 * Избира номера при първо пускане. Ново инсталиране (или изтрити данни) взима
 * ANDROID_ID — той не се сменя при преинсталиране, значи същият апарат остава
 * същият ред с името, което админът му е дал. TID-ът от myPOS НЕ става номер:
 * отпечатан е на апарата и по бележките, а номерът е и ключът, с който
 * терминалът тегли списъка с картите (cardList). Случаен номер — само ако
 * апаратът не казва ANDROID_ID (старо APK).
 */
const chooseDeviceId = (hw: DeviceIdentity | null): string => {
    try {
        const existing = localStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
        const raw = hw && hw.hwId.length >= 8
            ? `A${hw.hwId}`
            : crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        const id = raw.replace(/-/g, '').slice(0, 20).toUpperCase();
        localStorage.setItem(DEVICE_ID_KEY, id);
        return id;
    } catch {
        return '';
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
    runningVersion = appVersion;

    // Първо кой е апаратът (номерът при ново инсталиране зависи от това), после всичко.
    let stopped = false;
    let stopRunning: () => void = () => { };
    void readIdentity().then(hw => {
        const id = chooseDeviceId(hw);
        if (stopped || !id) return;
        stopRunning = runDevice(id, appVersion, hw);
    });
    return () => { stopped = true; stopRunning(); };
};

const runDevice = (id: string, appVersion: string, hw: DeviceIdentity | null): (() => void) => {
    let stopped = false;
    let battery: BatteryLike | null = null;
    // TID и ANDROID_ID — в УСТРОЙСТВА, и по тях ново инсталиране взима старото име.
    const identityFields = {
        ...(hw?.tid ? { tid: hw.tid } : {}),
        ...(hw?.hwId ? { hwId: hw.hwId } : {}),
    };

    const beat = () => {
        if (stopped) return;
        void readNfcStatus().then(nfc => {
            if (stopped) return;
            void writeDevice(id, {
                lastSeen: nowIso(),
                serverSeen: serverTimestamp(),
                appVersion,
                batteryLevel: battery ? Math.round(battery.level * 100) : null,
                batteryCharging: battery ? battery.charging : null,
                batteryAt: battery ? nowIso() : null,
                ...identityFields,
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
    // Позицията на автобуса за Наредба Н-7 — отделен документ, на всеки 30 s.
    const stopPosition = startPositionReport(id);
    // Списъкът с картите за проверка без връзка (Наредба Н-7, приложение № 3).
    const stopCards = startCardListSync(id);
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', beat);

    return () => {
        stopped = true;
        stopCapture();
        stopPosition();
        stopCards();
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
        serverSeen: serverTimestamp(),
        lastScanAt: nowIso(),
        scanDate: todayStr(),
        scansToday: bumpScanCount(),
    }, appVersion);
};
