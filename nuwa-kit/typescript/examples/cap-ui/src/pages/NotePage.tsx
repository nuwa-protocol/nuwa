import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PostMessageMCPTransport } from "@nuwa-ai/ui-kit";
import { useEffect, useRef } from "react";
import { z } from "zod";

export default function NotePage() {
  // Prevent double initialization in React Strict Mode
  const isServerInitialized = useRef(false);

  const editor = useCreateBlockNote({
    initialContent: [
      {
        type: "heading",
        content: "Hello World!",
        props: {
          level: 1,
        },
      },
    ],
  });

  const initMcpServer = async () => {
    try {
      // Create transport for communicating with parent window
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

      // Connect server to transport
      await server.connect(transport);
    } catch (error) {
      console.error("MCP server error:", error);
    }
  };


  // Initialize MCP server with cleanup on unmount
  // biome-ignore lint/correctness/useExhaustiveDependencies: suppress
  useEffect(() => {
    // Early return if server already initialized (prevents double initialization)
    if (isServerInitialized.current) {
      return;
    }

    initMcpServer();
    isServerInitialized.current = true;
  }, []);

  return (
    <div className="h-screen w-screen py-10 max-w-5xl mx-auto">
      <BlockNoteView
        editor={editor}
      />
    </div>
  );
}