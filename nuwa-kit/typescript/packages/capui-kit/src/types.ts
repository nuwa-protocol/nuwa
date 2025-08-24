import { z } from "zod";

type NuwaCapUIType = "embed" | "artifact";
export type NuwaCapUIURI = `capui://${NuwaCapUIType}/${string}`;

// Zod schemas for runtime validation
const urlSchema = z.string().url();
const nameSchema = z
	.string()
	.min(1)
	.regex(
		/^[a-zA-Z0-9-]+$/,
		"Name must contain only alphanumeric characters and hyphens",
	);

export const CreateCapUIResourceSchema = z.object({
	type: z.enum(["embed", "artifact"]),
	uiUrl: urlSchema,
	name: nameSchema,
	height: z.number().optional(),
});

export type CreateCapUIResourceProps = {
	type: NuwaCapUIType;
	uiUrl: URL;
	name: string;
	height?: number;
};

export type NuwaCapUIResource = {
	uri: NuwaCapUIURI;
	name: string;
	text: string;
	annotations: {
		height?: number;
	};
};
