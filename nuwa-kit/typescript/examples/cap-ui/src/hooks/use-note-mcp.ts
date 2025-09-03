import type { BlockNoteEditor } from "@blocknote/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PostMessageMCPTransport } from "@nuwa-ai/ui-kit";
import { useEffect } from "react";
import { z } from "zod";

/**
 * Creates an MCP server for BlockNote editor integration
 * @param editor The BlockNote editor instance
 * @returns Object containing the MCP server and transport
 */
const createNoteMCP = (editor: BlockNoteEditor) => {
	const transport = new PostMessageMCPTransport({
		targetWindow: window.parent,
		targetOrigin: "*",
		allowedOrigins: ["*"],
		debug: true,
		timeout: 10000,
	});

	// Initialize MCP server
	const server = new McpServer({
		name: "note-editor-mcp",
		version: "1.0.0",
	});

	// Register tool for editing content in the BlockNote editor
	server.registerTool(
		"edit_content",
		{
			title: "Add some content to the editor",
			description: "Add some content to the editor",
			inputSchema: {
				content: z.string().describe("The content to add to the editor"),
			},
		},
		({ content }) => {
			// Insert content into the BlockNote editor
			editor.insertInlineContent(content);
			console.log(`Adding content ${content}`);
			return {
				content: [
					{
						type: "text",
						text: `Content added: ${content}`,
					},
				],
			};
		},
	);

	return { server, transport };
};

export const useNoteMCP = (editor: BlockNoteEditor) => {
	// Initialize MCP server
	// biome-ignore lint/correctness/useExhaustiveDependencies: suppress
	useEffect(() => {
		const { server, transport } = createNoteMCP(editor);
		try {
			// Connect server to transport
			server.connect(transport);
		} catch (error) {
			console.error("MCP server error:", error);
		}

		// clean up on unmount
		return () => {
			server.close();
		};
	}, []);
};
