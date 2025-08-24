// Types
export type { CapUIOptions } from "./cap-ui";

// Vanilla JS Class (framework-agnostic)
export { CapUI } from "./cap-ui";
export type {
	CreateCapUIResourceProps,
	NuwaCapUIResource,
	NuwaCapUIURI,
	ValidName,
	ValidUrl,
} from "./types";
export { CreateCapUIResourceSchema } from "./types";
export type { UseCapUIParentProps } from "./use-cap-ui";

// React Hooks
export { useCapUI } from "./use-cap-ui";

// Utils
export { createCapUIResource, validateName, validateUrl } from "./utils";
