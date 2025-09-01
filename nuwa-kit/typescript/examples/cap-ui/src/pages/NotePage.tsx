import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useRef } from "react";
import { createNoteMCP } from "../utils/note-mcp";
import "@blocknote/mantine/style.css";

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
  const { server, transport } = createNoteMCP(editor);

  // Prevent double initialization in React Strict Mode
  const isServerInitialized = useRef(false);
  // Initialize MCP server with cleanup on unmount
  // biome-ignore lint/correctness/useExhaustiveDependencies: suppress
  useEffect(() => {
    // Early return if server already initialized (prevents double initialization)
    if (isServerInitialized.current) {
      try {
        // Connect server to transport
        server.connect(transport);
      } catch (error) {
        console.error("MCP server error:", error);
      }
    }
    isServerInitialized.current = true;
  }, []);

  return (
    <div className="h-screen w-screen py-10 max-w-5xl mx-auto">
      <BlockNoteView editor={editor} />
    </div>
  );
}
