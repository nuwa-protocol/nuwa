import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useNuwaClient } from "@nuwa-ai/ui-kit";
import { useNoteMCP } from "../hooks/use-note-mcp";
import "@blocknote/mantine/style.css";

export default function NotePage() {

  // create blocknote editor
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


  // connect to Nuwa Client on mount and obtain nuwa client methods
  //TODO FIXME
  const isNuwaConnected = true;
  const { nuwaClient } = useNuwaClient({
    onError: (error) => {
      console.error("Nuwa client error:", error);
    },
  });

  // start MCP server for Nuwa Client to connect
  useNoteMCP(editor);


  const handleSendNote = async () => {
    const content = JSON.stringify(editor.document);
    try {
      await nuwaClient.sendPrompt(`Here's my note content: ${content}`);
    } catch (error) {
      console.error("Failed to send note:", error);
    }
  };

  const handleAddNoteSelection = async () => {
    const content = JSON.stringify(editor.document);
    try {
      await nuwaClient.addSelection("Note Content", content);
    } catch (error) {
      console.error("Failed to add note selection:", error);
    }
  };

  const handleSaveNote = async () => {
    const content = editor.document;
    try {
      await nuwaClient.saveState({ noteContent: content, timestamp: Date.now() });
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  };

  const handleLoadNote = async () => {
    try {
      const savedData = await nuwaClient.getState();
      if (savedData?.noteContent) {
        editor.replaceBlocks(editor.document, savedData.noteContent);
      }
    } catch (error) {
      console.error("Failed to load note:", error);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col max-w-5xl mx-auto bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-800">Note Editor</h1>
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${isNuwaConnected ? "bg-green-500" : "bg-red-500 animate-pulse"
                  }`}
              />
              <span className="text-sm text-gray-600">
                {isNuwaConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={handleSendNote}
              disabled={!isNuwaConnected}
              className="px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300  transition-colors"
            >
              Send Prompt
            </button>
            <button
              type="button"
              onClick={handleAddNoteSelection}
              disabled={!isNuwaConnected}
              className="px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 disabled:bg-gray-300  transition-colors"
            >
              Add Selection
            </button>
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={!isNuwaConnected}
              className="px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:bg-gray-300  transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleLoadNote}
              disabled={!isNuwaConnected}
              className="px-3 py-2 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 disabled:bg-gray-300 transition-colors"
            >
              Load
            </button>
          </div>
        </div>
      </header>

      {/* Editor */}
      <div className="flex-1 py-10 px-6 bg-white">
        <BlockNoteView editor={editor} theme={'light'} />
      </div>
    </div>
  );
}
