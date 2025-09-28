import { DidAccountSigner, type SignerInterface } from "@nuwa-ai/identity-kit";
import { Args, RoochClient, Transaction } from "@roochnetwork/rooch-sdk";
import * as yaml from "js-yaml";
import { buildClient } from "./client";
import type { Cap, CapStats, Page, Result, ResultCap, RatingDistribution } from "./type";
import { experimental_createMCPClient as createMCPClient } from "ai";

export * from "./type";

export class CapKit {
	protected roochClient: RoochClient;
	protected contractAddress: string;
	protected mcpUrl: string;
	protected signer: SignerInterface;
	protected mcpClient?: any;
	protected mcpTools?: any;

	constructor(option: {
		mcpUrl: string;
		roochUrl: string;
		contractAddress: string;
		signer: SignerInterface;
	}) {
		this.roochClient = new RoochClient({ url: option.roochUrl });
		this.contractAddress = option.contractAddress;
		this.mcpUrl = option.mcpUrl;
		this.signer = option.signer;
	}

	async getTools() {
		if (!this.mcpClient) {
			const transport = await buildClient(this.mcpUrl, this.signer)
			this.mcpClient = await createMCPClient({ transport });
		}
		if (!this.mcpTools) {
			this.mcpTools = await this.mcpClient.tools();
		}
		return this.mcpTools
	}
	async mcpClose() {
		this.mcpClient?.close();
	}

	async queryByID(id: {
		id?: string;
		cid?: string;
	}): Promise<Result<ResultCap>> {
		try {
			// Get tools from MCP server
			const tools = await this.getTools();
			const queryCapByID = tools.queryCapByID;

			if (!queryCapByID) {
				throw new Error("Query Cap by id tool not available on MCP server");
			}

			// Upload file to IPFS
			const result = await queryCapByID.execute(id, {
				toolCallId: "queryCapByID",
				messages: [],
			});

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const queryResult = JSON.parse((result.content as any)[0].text);

			if (queryResult.code !== 200 && queryResult.code !== 404) {
				throw new Error(
					`Query with id failed: ${queryResult.error || "Unknown error"}`,
				);
			}

			return queryResult;
		} catch (e) {
			throw e
		}
	}

	async queryByName(
		name?: string,
		opt?: {
			tags?: string[];
			page?: number;
			size?: number;
			sortBy?:
				| "average_rating"
				| "downloads"
				| "favorites"
				| "rating_count"
				| "updated_at";
			sortOrder?: "asc" | "desc";
		},
	): Promise<Result<Page<ResultCap>>> {
		try {
			// Get tools from MCP server
			const tools = await this.getTools()
			const queryCapByName = tools.queryCapByName;

			if (!queryCapByName) {
				throw new Error("query tool not available on MCP server");
			}

			// Upload file to IPFS
			const result = await queryCapByName.execute(
				{
					name: name,
					tags: opt?.tags,
					page: opt?.page,
					pageSize: opt?.size,
					sortBy: opt?.sortBy,
					sortOrder: opt?.sortOrder,
				},
				{
					toolCallId: "query-cap-by-name",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const queryResult = JSON.parse((result.content as any)[0].text);
			if (queryResult.code === 404) {
				return {
					code: 200,
					data: {
						totalItems: 0,
						page: opt?.page || 0,
						pageSize: opt?.size || 50,
						items: [] as ResultCap[],
					},
				} as Result<Page<ResultCap>>;
			}
			if (queryResult.code !== 200) {
				throw new Error(
					`query failed: ${queryResult.error || "Unknown error"}`,
				);
			}
			// Transform the raw response data to ResultCap format
			// const transformedItems = queryResult.data.items.map((item: any) => {
			// 	return {
			// 		...item,
			// 	};
			// });

			return {
				code: queryResult.code,
				data: {
					totalItems: queryResult.data.totalItems,
					page: queryResult.data.page,
					pageSize: queryResult.data.pageSize,
					items: queryResult.data.items,
				},
			} as Result<Page<ResultCap>>;
		} catch (e) {
			throw e
		}
	}

	async queryMyFavorite(
		page?: number,
		size?: number,
	): Promise<Result<Page<ResultCap>>> {
		

		try {
			const tools = await this.getTools()
			const queryMyFavoriteCaps = tools.queryMyFavoriteCap;

			if (!queryMyFavoriteCaps) {
				throw new Error("queryMyFavoriteCaps tool not available on MCP server");
			}

			const result = await queryMyFavoriteCaps.execute(
				{
					page: page,
					pageSize: size,
				},
				{
					toolCallId: "queryMyFavoriteCaps",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const queryResult = JSON.parse((result.content as any)[0].text);

			if (queryResult.code !== 200) {
				throw new Error(
					`queryMyFavoriteCaps failed: ${queryResult.error || "Unknown error"}`,
				);
			}

			return {
				code: queryResult.code,
				data: {
					totalItems: queryResult.data.totalItems,
					page: queryResult.data.page,
					pageSize: queryResult.data.pageSize,
					items: queryResult.data.items,
				},
			} as Result<Page<ResultCap>>;
		} catch (e) {
			throw e
		}
	}

	async queryCapStats(capId: string): Promise<Result<CapStats>> {

		try {
			const tools = await this.getTools()
			const queryCapStats = tools.queryCapStats;

			if (!queryCapStats) {
				throw new Error("queryCapStats tool not available on MCP server");
			}

			const result = await queryCapStats.execute(
				{
					capId: capId,
				},
				{
					toolCallId: "queryCapStats",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const queryResult = JSON.parse((result.content as any)[0].text);

			if (queryResult.code !== 200) {
				throw new Error(
					`query cap stats failed: ${queryResult.error || "Unknown error"}`,
				);
			}

			return queryResult as Result<CapStats>;
		} catch (e) {
			throw e
		}
	}

	async rateCap(capId: string, rating: number): Promise<Result<boolean>> {
		// Validate rating is between 1 and 5
		if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
			throw new Error("Rating must be an integer between 1 and 5");
		}

		

		try {
			const tools = await this.getTools()
			const rateCap = tools.rateCap;

			if (!rateCap) {
				throw new Error("rateCap tool not available on MCP server");
			}

			const result = await rateCap.execute(
				{
					capId: capId,
					rating: rating,
				},
				{
					toolCallId: "rateCap",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			return {
				code: 200,
				data: true,
			} as Result<boolean>;
		} catch (e) {
			throw e
		}
	}

	async queryCapRatingDistribution(capId: string): Promise<Result<RatingDistribution[]>> {
		

		try {
			const tools = await this.getTools()
			const queryCapRatingDistribution = tools.queryCapRatingDistribution;

			if (!queryCapRatingDistribution) {
				throw new Error("queryCapRatingDistribution tool not available on MCP server");
			}

			const result = await queryCapRatingDistribution.execute(
				{
					capId: capId,
				},
				{
					toolCallId: "queryCapRatingDistribution",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const content = (result.content as any)?.[0]?.text;
			if (content) {
				try {
					const resut = JSON.parse(content);
					return {
						code: 200,
						data: resut.data.distribution,
					} as Result<RatingDistribution[]>;
				} catch (parseError) {
					throw new Error("Failed to parse rating distribution response");
				}
			}

			throw new Error("No data received");
		} catch (e) {
			throw e
		}
	}

	async favorite(
		capId: string,
		action: "add" | "remove" | "isFavorite",
	): Promise<Result<boolean>> {

		try {
			const tools = await this.getTools()
			const favoriteCap = tools.favoriteCap;

			if (!favoriteCap) {
				throw new Error("favoriteCap tool not available on MCP server");
			}

			const result = await favoriteCap.execute(
				{
					capId: capId,
					action: action,
				},
				{
					toolCallId: "favoriteCap",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			if (action === "isFavorite") {
				const data = JSON.parse(result.content[0].text);
				return {
					code: 200,
					data: data.isFavorite,
				} as Result<boolean>;
			} else {
				return {
					code: 200,
					data: true,
				} as Result<boolean>;
			}
		} catch (e) {
			throw e
		}
	}

	async updateEnableCap(
		capId: string,
		action: "enable" | "disable",
	): Promise<Result<boolean>> {
		

		try {
			const tools = await this.getTools()
			const updateEnableCap = tools.updateEnableCap;

			if (!updateEnableCap) {
				throw new Error("updateEnableCap tool not available on MCP server");
			}

			const result = await updateEnableCap.execute(
				{
					capId: capId,
					action: action,
				},
				{
					toolCallId: "updateEnableCap",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			return {
				code: 200,
				data: true,
			} as Result<boolean>;
		} catch (e) {
			throw e
		}
	}

	async downloadByID(id: string, format?: "base64" | "utf8"): Promise<Cap> {
		const result = await this.queryByID({ id: id });

		if (result.code === 200) {
			return this.downloadByCID(result.data!.cid, format);
		} else {
			throw new Error("Invalid Cap ID");
		}
	}

	async downloadByCID(cid: string, format?: "base64" | "utf8"): Promise<Cap> {
		

		try {
			// Get tools from MCP server
			const tools = await this.getTools()
			const downloadCap = tools.downloadCap;

			if (!downloadCap) {
				throw new Error("downloadCap tool not available on MCP server");
			}

			// Download file from IPFS
			const result = await downloadCap.execute(
				{
					cid: cid,
					dataFormat: format,
				},
				{
					toolCallId: "download-cap",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const downloadResult = JSON.parse((result.content as any)[0].text);

			if (downloadResult.code !== 200) {
				throw new Error(
					`Download failed: ${downloadResult.error || "Unknown error"}`,
				);
			}

			return yaml.load(downloadResult.data.fileData) as Cap;
		} catch (e) {
			throw e
		}
	}

	async registerCap(cap: Cap) {
		// len > 6 && len < 20, only contain a-z, A-Z, 0-9, _
		if (!/^[a-zA-Z0-9_]{6,20}$/.test(cap.idName)) {
			throw new Error(
				"Name must be between 6 and 20 characters and only contain a-z, A-Z, 0-9, _",
			);
		}

		// 1. Create ACP (Agent Capability Package) file
		const acpContent = yaml.dump(cap);

		// 2. Upload ACP file to IPFS using nuwa-cap-store MCP
		const cid = await this.uploadToIPFS(cap.id, acpContent, this.signer);

		// 3. Call Move contract to register the capability
		const result = await this.registerOnChain(cap.idName, cid, this.signer);

		if (result.execution_info.status.type !== "executed") {
			throw new Error("unknown error");
		}

		return cid;
	}

	private async uploadToIPFS(
		name: string,
		content: string,
		signer: SignerInterface,
	): Promise<string> {
		const client = await buildClient(this.mcpUrl, signer);

		try {
			// Get tools from MCP server
			const tools = await this.getTools()
			const uploadCap = tools.uploadCap;

			if (!uploadCap) {
				throw new Error("uploadCap tool not available on MCP server");
			}

			// Convert content to base64 (UTF-8 safe)
			const encoder = new TextEncoder();
			const bytes = encoder.encode(content);
			const fileData = btoa(String.fromCharCode(...bytes));
			const fileName = `${name}.cap.yaml`;

			// Upload file to IPFS
			const result = await uploadCap.execute(
				{
					fileName,
					fileData,
				},
				{
					toolCallId: "upload-cap",
					messages: [],
				},
			);

			if (result.isError) {
				throw new Error((result.content as any)?.[0]?.text || "Unknown error");
			}

			const uploadResult = JSON.parse((result.content as any)[0].text);
			const uploadData = uploadResult.data;

			if (uploadResult.code !== 200 || !uploadData.ipfsCid) {
				throw new Error(
					`Upload cap failed: ${uploadResult.error || "Unknown error"}`,
				);
			}

			return uploadData.ipfsCid;
		} catch (e) {
			throw e
		}
	}

	private async registerOnChain(
		name: string,
		cid: string,
		signer: SignerInterface,
	) {
		const chainSigner = await DidAccountSigner.create(signer);
		const transaction = new Transaction();
		transaction.callFunction({
			target: `${this.contractAddress}::acp_registry::register`,
			typeArgs: [],
			args: [Args.string(name), Args.string(cid)],
			maxGas: 500000000,
		});

		return await this.roochClient.signAndExecuteTransaction({
			transaction,
			signer: chainSigner,
		});
	}
}
