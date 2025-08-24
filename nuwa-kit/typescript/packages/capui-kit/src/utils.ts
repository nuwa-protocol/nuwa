import type {
	CreateCapUIResourceProps,
	NuwaCapUIResource,
	NuwaCapUIURI,
} from "./types";

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
		text: uiUrl.toString(),
		annotations: {
			height,
		},
	};
};
