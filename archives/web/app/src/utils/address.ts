/**
 * Shortens an address for display purposes
 * @param address The address to shorten
 * @param leadingChars Number of characters to show at the beginning
 * @param trailingChars Number of characters to show at the end
 * @returns Shortened address string
 */
export function shortenAddress(address: string, leadingChars = 6, trailingChars = 4): string {
  if (!address) return '';
  
  // Remove '0x' prefix for consistent display
  const cleanAddress = address.startsWith('rooch') ? address.substring(5) : address;
  
  if (cleanAddress.length <= leadingChars + trailingChars) {
    return address;
  }
  
  const start = cleanAddress.substring(0, leadingChars);
  const end = cleanAddress.substring(cleanAddress.length - trailingChars);
  
  return `rooch${start}...${end}`;
}
