import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useTheme } from "./lib/theme-provider";

export default function App() {
  // Creates a new editor instance.
  const editor = useCreateBlockNote();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Renders the editor instance using a React component.
  return (
    <div className="h-screen w-screen p-10">
      <div className="flex justify-end items-center mb-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
      <BlockNoteView editor={editor} theme={theme as "dark" | "light"} />
    </div>
  );
}
