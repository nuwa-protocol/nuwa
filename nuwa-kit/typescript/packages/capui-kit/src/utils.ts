import type {
	CreateCapUIResourceProps,
	NuwaCapUIResource,
	NuwaCapUIURI,
} from "./types";
import { validateName, validateUrl } from "./types";

export { validateUrl, validateName };

export const createCapUIResource = ({
	type,
	uiUrl,
	name,
	height,
}: CreateCapUIResourceProps): NuwaCapUIResource => {
	const uri = `capui://${type}/${name}` as NuwaCapUIURI;

	return {
		uri,
		name,
		text: uiUrl,
		annotations: {
			height,
		},
	};
};
