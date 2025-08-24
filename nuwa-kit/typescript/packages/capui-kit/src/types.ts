import { z } from "zod";

type NuwaCapUIType = "embed-NuwaCapUI" | "artifact-ui";
export type NuwaCapUIURI = `capui://${NuwaCapUIType}/${string}`;

// Branded types for compile-time validation
export type ValidUrl = string & { readonly __brand: unique symbol };
export type ValidName = string & { readonly __brand: unique symbol };

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
	type: z.enum(["embed-NuwaCapUI", "artifact-ui"]),
	uiUrl: urlSchema,
	name: nameSchema,
	height: z.number().optional(),
});

export type CreateCapUIResourceProps = {
	type: "embed-NuwaCapUI" | "artifact-ui";
	uiUrl: ValidUrl;
	name: ValidName;
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

// Helper functions to create branded types
export const validateUrl = (url: string): ValidUrl | null => {
	const result = urlSchema.safeParse(url);
	return result.success ? (url as ValidUrl) : null;
};

export const validateName = (name: string): ValidName | null => {
	const result = nameSchema.safeParse(name);
	return result.success ? (name as ValidName) : null;
};
