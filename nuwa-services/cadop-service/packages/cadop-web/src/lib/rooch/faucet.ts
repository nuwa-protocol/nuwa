/**
 * Faucet utilities for Rooch testnet RGAS claiming.
 */

export const DEFAULT_FAUCET_URL = 'https://test-faucet.rooch.network';

/**
 * Claim RGAS from Rooch testnet faucet.
 * @param agentAddress hex address of agent (without 0x prefix is acceptable)
 * @param faucetUrl override faucet service URL
 * @returns amount claimed (raw unit)
 */
export async function claimTestnetGas(
  agentAddress: string,
  faucetUrl: string = DEFAULT_FAUCET_URL
): Promise<number> {
  const resp = await fetch(`${faucetUrl}/faucet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimer: agentAddress }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `Claim failed with status ${resp.status}`);
  }
  const data = await resp.json();
  return data.gas || 5_000_000_000; // default fallback
}
