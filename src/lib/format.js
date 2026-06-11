// Number / currency formatting helpers (Intl.NumberFormat).

export const CURRENCIES = {
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
};

/**
 * Build a formatter for a currency code (default GBP).
 * Returns { money, number, symbol }.
 *   money(n)  -> '£1,234.56'
 *   number(n) -> '1,234.56'  (thousands + 2dp, no symbol; matches Python :,.2f)
 */
export function makeFormatters(currencyCode = 'GBP') {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.GBP;

  const numberFmt = new Intl.NumberFormat(cur.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const moneyFmt = new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
  });

  return {
    symbol: cur.symbol,
    code: cur.code,
    number: (n) => numberFmt.format(n),
    money: (n) => moneyFmt.format(n),
  };
}

/** Default GBP formatters. */
export const gbp = makeFormatters('GBP');
