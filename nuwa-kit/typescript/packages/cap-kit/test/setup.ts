import { createSelfDid, TestEnv } from "@nuwa-ai/identity-kit";
import { CapKit } from "../src";

const localContractAddress = "0xeb1deb6f1190f86cd4e05a82cfa5775a8a5929da49fac3ab8f5bf23e9181e625";
const testContractAddress = "0xeb1deb6f1190f86cd4e05a82cfa5775a8a5929da49fac3ab8f5bf23e9181e625";
// const testMcpUrl = "http://localhost:3000/mcp";
const testMcpUrl = "https://nuwa-test.up.railway.app/mcp";
const localMcpUrl = "http://localhost:3000/mcp";
const DEFAULT_FAUCET_URL = 'https://test-faucet.rooch.network';
const DEFAULT_TARGET = 'local'

async function claimTestnetGas(
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

export const setupEnv = async (target: 'test' | 'local' = DEFAULT_TARGET) => {
  const roochUrl = process.env.ROOCH_NODE_URL || target === 'test' ? 'https://test-seed.rooch.network' : 'http://localhost:6767';
  const mcpUrl = process.env.MCP_URL || target === 'test' ? testMcpUrl : localMcpUrl;
  const contractAddress = process.env.CONTRACT_ADDRESS || target === 'test' ? testContractAddress : localContractAddress;
  const env = await TestEnv.bootstrap({
    rpcUrl:  roochUrl,
    network: target,
    debug: false,
  });

  const { signer, did } = await createSelfDid(env, {
    customScopes: [`${contractAddress}::*::*`],
    secretKey: 'roochsecretkey1qylp6ehfqx4c0zw6w7jpdwxm7q3e739d9fkxq0ym6xjtt2v0lxgpvvhcqg6'
  });

  if (target === 'test') {
    await claimTestnetGas(did.split(':')[2]);
  }

  const capKit = new CapKit({
    roochUrl: roochUrl,
    mcpUrl: mcpUrl,
    contractAddress: contractAddress,
    signer,
  });

  return {
    env,
    signer,
    capKit,
  };
};