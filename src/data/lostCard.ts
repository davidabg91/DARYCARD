// Fee charged when a client loses their card and their profile is transferred
// to a new one. Recorded in the `fines` collection so it counts toward revenue
// (оборот) and the audit log without affecting subscription validity.
export const LOST_CARD_FINE = 5; // EUR

export interface Fine {
    id?: string;
    clientId: string;      // the NEW card the profile was moved to
    oldCardId: string;     // the lost card that was canceled
    clientName: string;
    amount: number;        // EUR
    reason: string;        // e.g. "Загубена карта"
    month: string;         // "YYYY-MM" the fine is booked into
    date: string;          // ISO timestamp
    performedBy: string;
    paymentMethod: string; // e.g. "В брой"
}
