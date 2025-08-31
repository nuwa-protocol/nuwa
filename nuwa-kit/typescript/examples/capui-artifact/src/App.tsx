import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  FileCaptionButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
  TextAlignButton,
  useCreateBlockNote,
} from "@blocknote/react";
import { useTheme } from "./lib/theme-provider";
import { useMcpServer } from "./use-mcp-server";

export default function App() {

  const { server, status } = useMcpServer();

  // Creates a new editor instance.
  const editor = useCreateBlockNote({
    initialContent: [
      {
        type: "heading",
        content: "Welcome to the demo!",
        props: {
          level: 1,
        },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "This is a demo of the CAPUI Artifact.",
            styles: {},
          },
        ],
      },
      {
        type: "paragraph",
        content: "Select some text to try them out",
      },
      {
        type: "paragraph",
      },
    ]
  });
  const { theme } = useTheme();


  // Renders the editor instance using a React component.
  return (
    <div className="h-screen w-screen py-10 max-w-5xl mx-auto">
      <div>
        <h1>MCP Server</h1>
        <p>{status.message}</p>
        <p>Connection status: {status.isConnected ? "Connected" : "Disconnected"}</p>
      </div>
      <BlockNoteView editor={editor} theme={theme as "dark" | "light"} formattingToolbar={false}>
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <BlockTypeSelect key={"blockTypeSelect"} />
              {/* Extra button to toggle blue text & background */}
              <FileCaptionButton key={"fileCaptionButton"} />
              <FileReplaceButton key={"replaceFileButton"} />
              <BasicTextStyleButton
                basicTextStyle={"bold"}
                key={"boldStyleButton"}
              />
              <BasicTextStyleButton
                basicTextStyle={"italic"}
                key={"italicStyleButton"}
              />
              <BasicTextStyleButton
                basicTextStyle={"underline"}
                key={"underlineStyleButton"}
              />
              <BasicTextStyleButton
                basicTextStyle={"strike"}
                key={"strikeStyleButton"}
              />
              {/* Extra button to toggle code styles */}
              <BasicTextStyleButton
                key={"codeStyleButton"}
                basicTextStyle={"code"}
              />
              <TextAlignButton
                textAlignment={"left"}
                key={"textAlignLeftButton"}
              />
              <TextAlignButton
                textAlignment={"center"}
                key={"textAlignCenterButton"}
              />
              <TextAlignButton
                textAlignment={"right"}
                key={"textAlignRightButton"}
              />
              <ColorStyleButton key={"colorStyleButton"} />
            </FormattingToolbar>
          )}
        />
      </BlockNoteView>
    </div>
  );
}
