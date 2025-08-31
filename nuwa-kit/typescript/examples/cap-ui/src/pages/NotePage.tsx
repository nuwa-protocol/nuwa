import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PostMessageMCPTransport } from "@nuwa-ai/ui-kit";
import { useEffect } from "react";
import { z } from "zod";

export default function NotePage() {
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
      const transport = new PostMessageMCPTransport({
        targetWindow: window.parent,
        targetOrigin: "*",
        allowedOrigins: ["*"],
        debug: true,
        timeout: 10000,
      });

      const server = new McpServer({
        name: "note-editor-mcp",
        version: "1.0.0",
      });

      server.registerTool(
        "edit_content",
        {
          title: "Add some content to the editor",
          description: "Add some content to the editor",
          inputSchema: {
            content: z.string().describe("The content to add to the editor"),
          },
        },
        async ({ content }) => {
          await editor.insertInlineContent(content);
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

      await server.connect(transport);
    } catch (error) {
      console.error("MCP server error:", error);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppress
  useEffect(() => {
    initMcpServer();
  }, []);

  return (
    <div className="h-screen w-screen py-10 max-w-5xl mx-auto">
      <BlockNoteView
        editor={editor}
      />
    </div>
  );
}