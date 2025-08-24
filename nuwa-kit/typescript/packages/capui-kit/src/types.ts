type CapUIType = "embed" | "artifact";
export type CapUIURI = `capui://${CapUIType}/${string}`;

export type CapUIResource = {
	uri: CapUIURI;
	name: string; // name of the Cap UI component
	text: string; // the url of the Cap UI component
	annotations: {
		height?: number; // specify the height of the Cap UI component
	};
};
