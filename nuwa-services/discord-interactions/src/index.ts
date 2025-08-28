import 'dotenv/config';
import express, { Request, Response } from 'express';
import type { APIInteraction } from 'discord-api-types/v10';
import { InteractionResponseType, InteractionType } from 'discord-api-types/v10';
import { commands } from './commands';
import { verifyInteractionRequest } from './verify-discord-request';
import { KeyManager } from '@nuwa-ai/identity-kit';
import { PaymentHubClient, RoochPaymentChannelContract } from '@nuwa-ai/payment-kit';
import { supabase } from "./supabase";
import dayjs from "dayjs";

const app = express();
const PORT = process.env.PORT || 3000;

// 读取环境变量
const DISCORD_APP_PUBLIC_KEY = process.env.DISCORD_APP_PUBLIC_KEY || '';
const FAUCET_URL = process.env.FAUCET_URL || 'https://test-faucet.rooch.network';
const ROOCH_RPC_URL = process.env.ROOCH_RPC_URL || 'https://test-seed.rooch.network';
const DEFAULT_ASSET_ID = '0x3::gas_coin::RGas';
const HUB_PRIVATE_KEY = process.env.HUB_PRIVATE_KEY || '';
const HUB_DID = process.env.HUB_DID || '';
const hubAddress = HUB_DID ? HUB_DID.split(':')[2] : '';

// 提供原始 body 给签名校验
app.use(
	'/api/discord/interactions',
	express.raw({ type: 'application/json' }) as any,
	(req: any, _res, next) => {
		if (req.body && Buffer.isBuffer(req.body)) {
			req.rawBody = req.body.toString('utf8');
		}
		next();
	},
);

// 其他路由可用 JSON 解析
app.use(express.json());

async function claimTestnetGas(agentAddress: string): Promise<number> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 30000);
	try {
		const resp = await fetch(`${FAUCET_URL}/faucet`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ claimer: agentAddress }),
			signal: controller.signal,
		});
		clearTimeout(timeoutId);
		if (!resp.ok) {
			const data = await resp.json().catch(() => ({}));
			throw new Error((data as any).error || `Claim failed with status ${resp.status}`);
		}
		const data = (await resp.json()) as any;
		return data.gas || 5_000_000_000;
	} catch (error) {
		clearTimeout(timeoutId);
		if ((error as any)?.name === 'AbortError') {
			throw new Error('Faucet request timed out');
		}
		throw error;
	}
}

async function transferFromHub(userDid: string, amount: number): Promise<string | null> {
	try {
		if (!HUB_PRIVATE_KEY || !HUB_DID) {
			console.log('HUB_PRIVATE_KEY or HUB_DID not configured, skipping transfer');
			return null;
		}
		const keyManager = new KeyManager({ did: HUB_DID });
		await keyManager.importKeyFromString(HUB_PRIVATE_KEY);
		const contract = new RoochPaymentChannelContract({ rpcUrl: ROOCH_RPC_URL });
		const hubClient = new PaymentHubClient({ contract, signer: keyManager, defaultAssetId: DEFAULT_ASSET_ID });
		const result = await hubClient.deposit(DEFAULT_ASSET_ID, BigInt(amount), userDid);
		return result.txHash;
	} catch (error) {
		console.error('Transfer from hub failed:', error);
		return null;
	}
}

app.get('/health', (_req: Request, res: Response) => {
	res.json({ status: 'ok' });
});

app.get("/claim_info", async (_req: Request, res: Response) => {
  try {
    const page = parseInt((_req.query.page as string) || "1", 10);
    const pageSize = parseInt((_req.query.pageSize as string) || "10", 10);
    const did = _req.query.did as string | undefined;

    let query = supabase
      .from("faucet_claims")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (did) {
      query = query.eq("did", did);
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      page,
      pageSize,
      total: count || 0,
      claims: data,
    });
  } catch (err) {
    console.error("claim_info error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


app.post('/api/discord/interactions', async (req: any, res: Response) => {
	const verifyResult = verifyInteractionRequest(req, DISCORD_APP_PUBLIC_KEY);
	if (!verifyResult.isValid) {
		return res.status(401).send('Invalid request');
	}
	const interaction = verifyResult.interaction as APIInteraction;

	if (interaction.type === InteractionType.Ping) {
		return res.json({ type: InteractionResponseType.Pong });
	}

	if (interaction.type === InteractionType.ApplicationCommand) {
		const { name } = (interaction as any).data;
		switch (name) {
			case commands.ping.name:
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: { content: 'Pong' },
				});
			case commands.faucet.name: {
				const options = (interaction as any).data?.options;
				if (options?.[0]?.value) {
					const did = options[0].value as string;
					const userAddress = did.split(':')[2];
					if (!userAddress) {
						return res.json({
							type: InteractionResponseType.ChannelMessageWithSource,
							data: { content: '❌ Invalid DID format. Use did:rooch:address' },
						});
					}

					// 异步处理 faucet + 转账，立即响应
					processInteractionAsync(did, interaction as any).catch((err) =>
						console.error('processInteractionAsync error', err),
					);
					return res.json({
						type: InteractionResponseType.ChannelMessageWithSource,
						data: { content: `🎉 Processing the request for \`${did}\`...` },
					});
				}
				return res.json({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: { content: '❌ Please provide a DID value. `/faucet did:rooch:your_address_here`' },
				});
			}
			default:
				return res.status(400).send('Unknown command');
		}
	}
	return res.status(400).send('Unknown interaction');
});


async function processInteractionAsync(userDid: string, interaction: any) {
	if (!hubAddress) return;

	const applicationId = interaction.application_id;
	const interactionToken = interaction.token;
	const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
	const userId = interaction.member?.user?.id || interaction.user?.id;
	const mention = userId ? `<@${userId}>` : userDid;

	try {

		const startOfDay = dayjs().startOf("day").toISOString();
		const { data: existingClaims, error: checkError } = await supabase
			.from("faucet_claims")
			.select("id")
			.eq("did", userDid)
			.gte("created_at", startOfDay);

		if (checkError) {
			console.error("Supabase check error:", checkError);
		}

		if (existingClaims && existingClaims.length > 0) {
			// 已领取，直接回复
			await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: `${mention} ❌ You have already claimed testnet funds today. Please try again tomorrow.`,
					embeds: [
						{
							title: "Claim Limit Reached",
							description: "You can only claim once per day.",
							color: 0xff0000,
						},
					],
				}),
			});
			return;
		}

		const claimedAmount = await claimTestnetGas(hubAddress);
		const rgasAmount = Math.floor(claimedAmount / 100000000);
		const transferAmount = Math.floor((claimedAmount * 50) / 100);
		const transferRgasAmount = Math.floor(transferAmount / 100000000);
		const transferUsdAmount = transferRgasAmount / 100;

		const result = await transferFromHub(userDid, transferAmount);
		if (result) {
			await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: `${mention}`,
					embeds: [
						{
							title: "Claim Successful 🎉",
							description: `**$${transferUsdAmount}** USD test balance has been sent to your account.\n\n**Check your balance on [Nuwa AI Beta](https://test-app.nuwa.dev)**`,
							color: 0x00ff00,
						},
					],
				}),
			});
			const userAddress = userDid.split(":")[2];
			await supabase.from("faucet_claims").insert({
				did: userDid,
				address: userAddress,
				claimed_amount: transferAmount,
			});
		} else {
			await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: `${mention} ❌ Successfully claimed **${rgasAmount} RGAS** to hub account, but failed to transfer to your wallet. Please try again later.`,
					embeds: [
						{
							title: "Claim Success, Transfer Failed",
							description: `✅ Claimed ${rgasAmount} RGAS to hub\n❌ Failed to transfer to user wallet`,
							color: 0xffaa00,
						},
					],
				}),
			});
		}
	} catch (error) {
		console.error("Process interaction error:", error);
		await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: `${mention} ❌ Error occurred while processing claim and transfer: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
				embeds: [
					{
						title: "Error",
						description: "An error occurred during the claim and transfer process",
						color: 0xff0000,
					},
				],
			}),
		});
	}
}
app.listen(PORT, () => {
	console.log(`Discord Interactions service listening on http://127.0.0.1:${PORT}`);
}); 