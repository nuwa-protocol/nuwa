import { z } from "zod/v3";

export const CapAuthorDIDSchema = z.string().startsWith("did::");
export const CapIDNameSchema = z
	.string()
	.regex(
		/^[a-z0-9_]+$/,
		"Name must contain only lowercase letters, numbers, and underscores",
	)
	.min(6, "Name must be at least 6 characters")
	.max(20, "Name must be at most 20 characters");

export const CapArtifactSchema = z.object({
	srcUrl: z.string().url('Must be a valid URL'),
});

export const CapIDSchema = z
	.object({
		authorDID: CapAuthorDIDSchema,
		idName: CapIDNameSchema,
	})
	.transform((data) => ({
		...data,
		id: `${data.authorDID}:${data.idName}`,
	}));

export const CapModelSchema = z.object({
	customGatewayUrl: z.string().url("Must be a valid URL").optional(),
	modelId: z
		.string()
		.max(50, "Model ID must be at most 50 characters")
		.refine((id) => id.length > 0, "Model ID is required"),
	parameters: z.record(z.string(), z.any()).optional(),
	supportedInputs: z
		.array(z.enum(["text", "image", "file", "audio"]))
		.min(1)
		.refine((inputs) => inputs.includes("text"), "text input is required"),
	modelType: z.enum([
		"Language Model",
		"Responses Model",
		"Embedding Model",
		"Image Model",
		"Transcription Model",
		"Speech Model",
	]),
	contextLength: z
	.number()
	.refine((num) => num > 0, 'Context length must be greater than 0'),
});

export const CapPromptSuggestionSchema = z
	.string()
	.max(50, "Each suggestion must be at most 50 characters");

export const CapPromptSchema = z.object({
	value: z.string(),
	suggestions: z.array(CapPromptSuggestionSchema).optional(),
});

export const CapMcpServerSchema = z.string().url("Must be a valid URL");

export const CapCoreSchema = z.object({
	prompt: CapPromptSchema,
	model: CapModelSchema,
	mcpServers: z.record(z.string(), CapMcpServerSchema),
});

export const CapThumbnailSchema = z
	.string().optional();

export const CapMetadataSchema = z.object({
	displayName: z
		.string()
		.min(1, "Display name is required")
		.max(50, "Display name too long"),
	description: z
		.string()
		.min(20, "Description must be at least 10 characters")
		.max(500, "Description too long"),
	tags: z.array(z.string()).min(1, "At least one tag is required"),
	homepage: z.string().url("Must be a valid URL").optional(),
	repository: z.string().url("Must be a valid URL").optional(),
	thumbnail: CapThumbnailSchema,
});

export const CapSchema = CapIDSchema.and(
	z.object({
		core: CapCoreSchema,
		metadata: CapMetadataSchema,
		artifact: CapArtifactSchema.optional(),
	}),
);

// Inferred TypeScript types from Zod schemas
export type CapMcpServer = z.infer<typeof CapMcpServerSchema>;
export type CapModel = z.infer<typeof CapModelSchema>;
export type CapPrompt = z.infer<typeof CapPromptSchema>;
export type CapID = z.infer<typeof CapIDSchema>;
export type CapCore = z.infer<typeof CapCoreSchema>;
export type CapThumbnail = z.infer<typeof CapThumbnailSchema>;
export type CapMetadata = z.infer<typeof CapMetadataSchema>;
export type Cap = z.infer<typeof CapSchema>;

export interface Result<T> {
	code: number;
	error?: string;
	data?: T;
}

export interface Page<T> {
	totalItems: number;
	page: number;
	pageSize: number;
	items: T[];
}

export const CapStatsSchema = z.object({
	capId: z.string(),
	downloads: z.number(),
	ratingCount: z.number(),
	averageRating: z.number(),
	favorites: z.number(),
	userRating: z.number().optional(),
});

export const ResultCapMetadataSchema = z.object({
	id: z.string(),
	cid: z.string(),
	name: z.string(),
	version: z.string(),
	displayName: z.string(),
	description: z.string(),
	timestamp: z.string(),
	tags: z.array(z.string()),
	homepage: z.string().optional(),
	repository: z.string().optional(),
	thumbnail: CapThumbnailSchema,
	stats: CapStatsSchema,
});

export const RatingDistribution = z.object({
  rating: z.number(),
  count: z.number(),
})

// Inferred TypeScript types from Zod schemas
export type ResultCap = z.infer<typeof ResultCapMetadataSchema>;
export type CapStats = z.infer<typeof CapStatsSchema>;
export type RatingDistribution = z.infer<typeof RatingDistribution>;
