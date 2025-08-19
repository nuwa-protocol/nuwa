import { type NextRequest, NextResponse } from "next/server";
import urlMetadata from "url-metadata";
import { authenticate } from "./auth";


export const runtime = "nodejs";


// define the request body type
interface UrlMetadataRequest {
	urls: string[];
}

// CORS configuration function
function setCorsHeaders(response: NextResponse): NextResponse {
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization",
	);
	response.headers.set("Access-Control-Max-Age", "86400");
	return response;
}

// convert the standard Response to NextResponse and add CORS headers
function handleAuthError(error: Response): NextResponse {
	const nextResponse = NextResponse.json(
		{ error: error.statusText || "Unauthorized" },
		{ status: error.status || 401 },
	);
	return setCorsHeaders(nextResponse);
}

// handle OPTIONS request (preflight request)
export async function OPTIONS(request: NextRequest) {
	const response = new NextResponse(null, { status: 200 });
	return setCorsHeaders(response);
}

export async function POST(request: NextRequest) {
	try {
		// add CORS headers
		const response = new NextResponse();
		setCorsHeaders(response);

		// perform DID authentication
		await authenticate(request);
		// parse the request body
		const body: UrlMetadataRequest = await request.json();

		// validate the URLs parameter
		if (!body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
			const errorResponse = NextResponse.json(
				{ error: "URLs parameter is required and must be a non-empty array" },
				{ status: 400 },
			);
			return setCorsHeaders(errorResponse);
		}

		// validate each URL format
		for (const url of body.urls) {
			if (typeof url !== "string") {
				const errorResponse = NextResponse.json(
					{ error: "Each URL must be a string" },
					{ status: 400 },
				);
				return setCorsHeaders(errorResponse);
			}

			try {
				new URL(url);
			} catch (error) {
				const errorResponse = NextResponse.json(
					{ error: `Invalid URL format: ${url}` },
					{ status: 400 },
				);
				return setCorsHeaders(errorResponse);
			}
		}

		// get metadata for all URLs
		const results: Record<string, any> = {};

		// use Promise.allSettled to parallel process all URLs, avoid one failure affecting others
		const promises = body.urls.map(async (url) => {
			try {
				const metadata = await urlMetadata(url);
				return { url, metadata, success: true };
			} catch (error) {
				console.error(`Error getting metadata for ${url}:`, error);
				return {
					url,
					error: error instanceof Error ? error.message : "Unknown error",
					success: false,
				};
			}
		});

		const resultsArray = await Promise.allSettled(promises);

		// process the results, build the response object with URL as the key
		resultsArray.forEach((result) => {
			if (result.status === "fulfilled") {
				const { url, metadata, success, error } = result.value;
				if (success) {
					results[url] = metadata;
				} else {
					results[url] = { error };
				}
			} else {
				// Promise rejected
				console.error("Promise rejected:", result.reason);
			}
		});

		const successResponse = NextResponse.json(results);
		return setCorsHeaders(successResponse);
	} catch (error) {
		console.error("Error processing URL metadata requests:", error);

		// if it is an authentication error, return directly
		if (error instanceof Response) {
			return handleAuthError(error);
		}

		// return the corresponding error message based on the error type
		if (error instanceof Error) {
			if (
				error.message.includes("ENOTFOUND") ||
				error.message.includes("getaddrinfo")
			) {
				const errorResponse = NextResponse.json(
					{ error: "Cannot resolve domain or network connection failed" },
					{ status: 404 },
				);
				return setCorsHeaders(errorResponse);
			}

			if (
				error.message.includes("ECONNREFUSED") ||
				error.message.includes("ETIMEDOUT")
			) {
				const errorResponse = NextResponse.json(
					{ error: "Connection refused or timed out" },
					{ status: 503 },
				);
				return setCorsHeaders(errorResponse);
			}

			if (error.message.includes("ENOENT") || error.message.includes("404")) {
				const errorResponse = NextResponse.json(
					{ error: "Page not found or cannot be accessed" },
					{ status: 404 },
				);
				return setCorsHeaders(errorResponse);
			}
		}

		const errorResponse = NextResponse.json(
			{
				error: "Unknown error occurred while processing URL metadata requests",
			},
			{ status: 500 },
		);
		return setCorsHeaders(errorResponse);
	}
}
