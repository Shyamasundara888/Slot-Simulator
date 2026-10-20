/** Crediti con due decimali, nel formato italiano. */
export const money = (credits: number) =>
  credits.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Come money, con il segno + davanti ai valori positivi. */
export const signedMoney = (credits: number) => (credits > 0 ? `+${money(credits)}` : money(credits));

/** Classe CSS per colorare un bilancio. */
export const trend = (credits: number) => (credits > 0 ? "up" : credits < 0 ? "down" : "");
