export const PAYMENT_METHODS = ['В брой', 'С карта', 'Банка', 'Смесено'] as const;

/** The mixed (bank + cash split) payment method. */
export const MIXED_METHOD = 'Смесено';

/**
 * Пази от изпуснат минус при създаване или подновяване на карта (напр. -45 вместо 45).
 * Проверява общата сума и поотделно частите на смесеното плащане — иначе
 * 80 по банка и -35 в брой дават 45 и минават. Връща текста на грешката или null.
 */
export const negativeAmountError = (total: number, parts: number[] = []): string | null => {
    if (parts.some(p => p < 0)) {
        return 'Сумите при смесено плащане не могат да са отрицателни. Проверете дали не е изписан минус.';
    }
    if (!(total >= 0)) {
        return `Сумата не може да е отрицателна (въведено: ${total}). Проверете дали не е изписан минус.`;
    }
    return null;
};
