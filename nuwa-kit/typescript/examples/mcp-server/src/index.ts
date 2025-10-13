import { IdentityKit, KeyManager } from "@nuwa-ai/identity-kit";
import { createFastMcpServerFromEnv } from "@nuwa-ai/payment-kit/mcp";
import { createUIResource } from "@nuwa-ai/ui-kit";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// -----------------------------------------------------------------------------
// Create Payment-enabled FastMCP server with Nuwa built-ins
// -----------------------------------------------------------------------------
async function main() {
	const serviceKey = process.env.SERVICE_KEY || "";
	if (!serviceKey) {
		throw new Error("SERVICE_KEY environment variable is required");
	}
	const keyManager = await KeyManager.fromSerializedKey(serviceKey);
	const serviceDid = await keyManager.getDid();

	const port = Number(process.env.PORT || 8080);

	const env = await IdentityKit.bootstrap({
		method: "rooch",
		keyStore: keyManager.getStore(),
		vdrOptions: {
			network: "test",
		},
	});
	const server = await createFastMcpServerFromEnv(env, {
		serviceId: "nuwa-mcp-demo",
		adminDid: serviceDid,
		debug: true,
		port,
		endpoint: "/mcp",
		wellKnown: {
			enabled: true,
		},
	});

	// Register example free tools (no billing) and paid tools (with billing)
	server.paidTool({
		name: "echo",
		description: "Echo back the provided text.",
		parameters: { text: z.string().describe("Text to echo back") },
		pricePicoUSD: BigInt(1000000000), // 0.001 USD
		async execute({ text }) {
			return text;
		},
	});

	server.freeTool({
		name: "get_did",
		description: "Get the DID of the caller (from __nuwa_auth if provided).",
		parameters: {},
		async execute(_args: unknown, context: any) {
			const did = context?.didInfo?.did || "unknown";
			return { did };
		},
	});

	server.freeTool({
		name: "render_ui_demo_weather_card",
		description: "Call this tool to return the Demo Weather Card UI",
		parameters: {
			longitude: z
				.number()
				.describe("The longitude of the city to get the weather for"),
			latitude: z
				.number()
				.describe("The latitude of the city to get the weather for"),
		},
		async execute({ longitude, latitude }) {
			const UIResource = createUIResource({
				url: `http://localhost:3000?longitude=${longitude}&latitude=${latitude}`,
			});
			return {
				content: [UIResource, { type: "text", text: "Rendered the demo UI!" }],
			};
		},
	});

	await server.start();

	console.log(
		`✅ MCP server with Nuwa payment started on http://localhost:${port}/mcp`,
	);
	console.log(`✅ Service DID: ${serviceDid}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
