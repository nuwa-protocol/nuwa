/**
 * Utility functions for formatting numbers and amounts
 */

/**
 * Format USD amount from pico-USD to display format
 * @param picoUSD - Amount in pico-USD (1 USD = 1,000,000,000,000 pico-USD)
 * @returns Formatted USD string with 2 decimal places
 */
export function formatUSD(picoUSD: bigint): string {
  const usd = Number(picoUSD) / 1_000_000_000_000; // Convert from pico-USD
  return usd.toFixed(2);
}

/**
 * Format token amount with decimals
 * @param amount - Token amount as bigint
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted token amount string
 */
export function formatTokenAmount(amount: bigint, decimals: number = 8): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const integer = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return integer.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmedFraction = fractionStr.replace(/0+$/, '');
  return `${integer}.${trimmedFraction}`;
}

/**
 * Format bigint with decimals, supporting negative values and custom fraction digits
 * @param value - Value as bigint
 * @param decimals - Number of decimal places
 * @param fractionDigits - Optional: limit displayed fraction digits
 * @returns Formatted string
 */
export function formatBigIntWithDecimals(
  value: bigint,
  decimals: number,
  fractionDigits?: number
): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const integer = v / base;
  let fraction = (v % base).toString().padStart(decimals, '0');

  if (typeof fractionDigits === 'number') {
    fraction = fraction.slice(0, fractionDigits);
  }

  const fracPart =
    fraction && fraction !== '0'.repeat(fraction.length) ? `.${fraction.replace(/0+$/, '')}` : '';

  return `${negative ? '-' : ''}${integer.toString()}${fracPart}`;
}

/**
 * Parse amount string to bigint with specified decimals
 * @param amountStr - Amount as string (e.g., "1.23")
 * @param decimals - Number of decimal places (default: 8)
 * @returns Amount as bigint
 */
export function parseAmount(amountStr: string, decimals: number = 8): bigint {
  if (!amountStr || amountStr === '') return 0n;

  const parts = amountStr.split('.');
  const integerPart = parts[0] || '0';
  const fractionalPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);

  const integerBigInt = BigInt(integerPart) * BigInt(10) ** BigInt(decimals);
  const fractionalBigInt = BigInt(fractionalPart);

  return integerBigInt + fractionalBigInt;
}
