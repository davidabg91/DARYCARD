/**
 * Видовете смущения, които шофьорът подава от терминала, и как се превеждат в
 * GTFS-Realtime. Отделно, за да го ползват и `disruptions.ts`, и `gtfsRt.ts`
 * без кръгова зависимост. Етикетите са същите като в src/components/DisruptionButton.tsx.
 *
 * `cancels` — курсът не се изпълнява (докрай): TripUpdate CANCELED.
 * `hours`   — колко дълго важи сигналът, ако шофьорът не го прекрати сам.
 */
export const DISRUPTION_KINDS = {
    breakdown: { label: "Авария — курсът не продължава", cancels: true, cause: "TECHNICAL_PROBLEM", effect: "NO_SERVICE", hours: 4 },
    cancelled: { label: "Курсът е отменен", cancels: true, cause: "OTHER_CAUSE", effect: "NO_SERVICE", hours: 4 },
    accident: { label: "Пътен инцидент", cancels: false, cause: "ACCIDENT", effect: "SIGNIFICANT_DELAYS", hours: 2 },
    delay: { label: "Голямо закъснение", cancels: false, cause: "UNKNOWN_CAUSE", effect: "SIGNIFICANT_DELAYS", hours: 2 },
    detour: { label: "Отклонение / затворен път", cancels: false, cause: "UNKNOWN_CAUSE", effect: "DETOUR", hours: 3 },
} as const;
export type DisruptionKind = keyof typeof DISRUPTION_KINDS;
