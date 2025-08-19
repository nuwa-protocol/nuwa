export const commands = {
	ping: {
		name: "ping",
		description: "Ping pong! I'll respond with pong.",
	} as const,
	faucet: {
		name: "faucet",
		description: "Get testnet RGAS on Nuwa AI",
		options: [
			{
				name: "did",
				description: "Your DID (did:rooch:address)",
				type: 3, // STRING type
				required: true,
			},
		],
	} as const,
} as const; 