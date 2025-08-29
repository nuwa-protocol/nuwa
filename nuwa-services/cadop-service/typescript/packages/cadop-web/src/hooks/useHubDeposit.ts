import { useCallback, useState } from "react";
import { DEFAULT_ASSET_ID } from "@/config/env";
import { usePaymentHubClient } from "./usePaymentHubClient";

export function useHubDeposit(agentDid?: string | null) {
	const { hubClient } = usePaymentHubClient(agentDid || undefined);
	const [depositing, setDepositing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	const depositRaw = useCallback(
		async (
			amount: bigint,
			assetId: string = DEFAULT_ASSET_ID,
		): Promise<{ txHash: string } | null> => {
			if (!hubClient) throw new Error("PaymentHub client is not ready");
			if (amount <= 0n) return null;
			setDepositing(true);
			setError(null);
			try {
				const res = await hubClient.deposit(assetId, amount);
				return res;
			} catch (e: any) {
				setError(e?.message || String(e));
				throw e;
			} finally {
				setDepositing(false);
			}
		},
		[hubClient],
	);

	const depositPercentOfClaimed = useCallback(
		async (
			claimedRaw: number | bigint,
			percent: number,
			assetId: string = DEFAULT_ASSET_ID,
		): Promise<{ txHash: string; confirmed: boolean } | null> => {
			if (!hubClient) throw new Error("PaymentHub client is not ready");
			
			const claimed = typeof claimedRaw === "bigint" ? claimedRaw : BigInt(claimedRaw);
			const amount = (claimed * BigInt(Math.floor(percent))) / 100n;
			if (amount <= 0n) return null;

			// Capture pre-deposit balance to detect confirmation via balance change
			let before = 0n;
			try {
				before = await hubClient.getBalance({ assetId });
			} catch (_) {
				// ignore pre-read failure, still proceed
			}

			const res = await depositRaw(amount, assetId);
			if (!res) return null;

			// Poll for balance update to reflect the deposit
			const expected = before + amount;
			const maxAttempts = 10;
			const intervalMs = 1500;
			let confirmed = false;
			
			for (let i = 0; i < maxAttempts; i++) {
				let current: bigint | null = null;
				try {
					current = await hubClient.getBalance({ assetId });
					if (current >= expected) {
						console.log("balance updated", {
							attempt: i + 1,
							current: current.toString(),
							expected: expected.toString(),
						});
						confirmed = true;
						break;
					}
				} catch (_) {
					// ignore and keep waiting
				}
				console.log("waiting for balance update", {
					attempt: i + 1,
					expected: expected.toString(),
					current: current?.toString(),
				});
				await sleep(intervalMs);
			}

			if (!confirmed) {
				console.warn("Deposit transaction sent but balance confirmation timed out");
			} else {
				console.log("deposit completed and confirmed");
			}

			return { txHash: res.txHash, confirmed };
		},
		[hubClient, depositRaw, sleep],
	);

	return { depositRaw, depositPercentOfClaimed, depositing, error };
}
