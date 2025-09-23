import { KeyManager } from '@nuwa-ai/identity-kit';
import { PaymentHubClient, RoochPaymentChannelContract } from '@nuwa-ai/payment-kit';

const DEFAULT_ASSET_ID = '0x3::gas_coin::RGas';

export async function transferFromHubToUser(userDid: string, amount: bigint): Promise<string | null> {
	try {
		const HUB_PRIVATE_KEY = process.env.HUB_PRIVATE_KEY || '';
		const HUB_DID = process.env.HUB_DID || '';
		const ROOCH_RPC_URL = process.env.ROOCH_RPC_URL || 'https://test-seed.rooch.network';
		if (!HUB_PRIVATE_KEY || !HUB_DID) {
			console.log('HUB_PRIVATE_KEY or HUB_DID not configured, skip transfer');
			return null;
		}
		const keyManager = new KeyManager({ did: HUB_DID });
		await keyManager.importKeyFromString(HUB_PRIVATE_KEY);
		const contract = new RoochPaymentChannelContract({ rpcUrl: ROOCH_RPC_URL });
		const hubClient = new PaymentHubClient({ contract, signer: keyManager, defaultAssetId: DEFAULT_ASSET_ID });
		const result = await hubClient.deposit(DEFAULT_ASSET_ID, amount, userDid);
		return result.txHash;
	} catch (error) {
		console.error('transferFromHubToUser error', error);
		return null;
	}
} 