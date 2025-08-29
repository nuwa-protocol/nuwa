import { z } from 'zod';

export interface Result<T> {
  code: number;
  error?: string;
  data?: T;
}

export interface Page<T> {
  totalItems: number,
  page: number,
  pageSize: number,
  items: T[]
}

export const CapStatsSchema = z.object({
  capId: z.string(),
  downloads: z.number(),
  ratingCount: z.number(),
  averageRating: z.number(),
  favorites: z.number(),
  userRating: z.number().optional(),
});

// Zod schemas as single source of truth
export const CapMcpServerConfigSchema = z.object({
  url: z.string(),
  transport: z.enum(['httpStream', 'sse']),
});

export const CapModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  providerName: z.string(),
  providerSlug: z.string(),
  description: z.string(),
  contextLength: z.number(),
  pricing: z.object({
    input_per_million_tokens: z.number(),
    output_per_million_tokens: z.number(),
    request_per_k_requests: z.number(),
    image_per_k_images: z.number(),
    web_search_per_k_searches: z.number(),
  }),
  supported_inputs: z.array(z.string()),
  supported_parameters: z.array(z.string()),
});

export const CapPromptSchema = z.object({
  value: z.string(),
  suggestions: z.array(z.string()).optional(),
});

export const CapIDSchema = z.object({
  id: z.string(),
  authorDID: z.string(),
  idName: z.string(),
});

export const CapCoreSchema = z.object({
  prompt: CapPromptSchema,
  model: CapModelSchema,
  mcpServers: z.record(z.string(), CapMcpServerConfigSchema),
});

export const CapThumbnailSchema = z
  .object({
    type: z.enum(['file', 'url']),
    file: z.string().optional(),
    url: z.string().optional(),
  })
  .nullable();

export const CapMetadataSchema = z.object({
  displayName: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  submittedAt: z.number(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  thumbnail: CapThumbnailSchema,
});

export const CapSchema = CapIDSchema.extend({
  core: CapCoreSchema,
  metadata: CapMetadataSchema,
});

export const ResultCapMetadataSchema = z.object({
  id: z.string(),
  cid: z.string(),
  name: z.string(),
  version: z.string(),
  displayName: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  submittedAt: z.number(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  thumbnail: CapThumbnailSchema,
});

// Inferred TypeScript types from Zod schemas
export type CapMcpServerConfig = z.infer<typeof CapMcpServerConfigSchema>;
export type CapModel = z.infer<typeof CapModelSchema>;
export type CapPrompt = z.infer<typeof CapPromptSchema>;
export type CapID = z.infer<typeof CapIDSchema>;
export type CapCore = z.infer<typeof CapCoreSchema>;
export type CapThumbnail = z.infer<typeof CapThumbnailSchema>;
export type CapMetadata = z.infer<typeof CapMetadataSchema>;
export type Cap = z.infer<typeof CapSchema>;
export type ResultCap = z.infer<typeof ResultCapMetadataSchema>;
export type CapStats = z.infer<typeof CapStatsSchema>;