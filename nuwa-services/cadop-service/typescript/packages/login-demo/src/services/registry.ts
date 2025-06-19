import { VDRRegistry, initRoochVDR } from '@nuwa-ai/identity-kit';
import { getCadopDomain } from './DeepLink';


export function resolveNetworkFromHost(hostname: string): 'test' | 'main' {
  let cleanHost = hostname.replace(/^https?:\/\//, '');
  if (cleanHost.includes(':')) cleanHost = cleanHost.split(':')[0];
  const h = cleanHost.toLowerCase();

  if (h.startsWith('test-') || h === 'test-id.nuwa.dev') return 'test';
  if (h === 'id.nuwa.dev' || h.endsWith('.id.nuwa.dev')) return 'main';
  return 'test';
}


export const registry: VDRRegistry = (() => {
  const cadopDomain = getCadopDomain();
  const network = resolveNetworkFromHost(cadopDomain);
 
  initRoochVDR(network, import.meta.env.VITE_ROOCH_RPC_URL);

  return VDRRegistry.getInstance();
})(); 