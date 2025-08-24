// Types
export type { CapUIOptions } from "./src/cap-ui";

// Vanilla JS Class (framework-agnostic)
export { CapUI } from "./src/cap-ui";
export type {
	CreateCapUIResourceProps,
	NuwaCapUIResource,
	NuwaCapUIURI,
	ValidName,
	ValidUrl,
} from "./src/types";
export { CreateCapUIResourceSchema } from "./src/types";
export type { UseCapUIParentProps } from "./src/use-cap-ui";

// React Hooks
export { useCapUI } from "./src/use-cap-ui";

// Utils
export { createCapUIResource, validateName, validateUrl } from "./src/utils";
