import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import { useTheme } from "@/providers/ThemeProvider";

interface DocContentProps {
  content: string;
}

const extractMermaidTitle = (content: string): string => {
  const commentMatch = content.match(/%%\s*(.+)/);
  if (commentMatch) {
    return commentMatch[1].trim();
  }

  const titleMatch = content.match(/title\s+(.+)/);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  return "Chart";
};

export const DocContent = ({ content }: DocContentProps) => {
  const { theme } = useTheme();

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      securityLevel: "loose",
      theme: theme === "dark" ? "dark" : "base",
      darkMode: theme === "dark",
    });
    // Update all mermaid diagrams
    setTimeout(() => {
      mermaid.run();
    }, 0);
  }, [content, theme]); // Re-run when content or theme changes

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="prose prose-slate max-w-none transition-shadow duration-200 dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-h1:mb-6 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3 prose-h1:text-3xl prose-h2:mb-4 prose-h2:mt-10 prose-h2:text-2xl prose-h2:text-gray-800 prose-h3:mb-3 prose-h3:mt-8 prose-h3:text-xl prose-h3:text-gray-700 prose-p:text-base prose-p:leading-7 prose-p:text-gray-600 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-blockquote:rounded-r-lg prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:px-3 prose-blockquote:py-1 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600 prose-figure:my-6 prose-strong:font-semibold prose-strong:text-gray-900 prose-code:rounded-md prose-code:bg-blue-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-blue-600 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:border-gray-200 prose-pre:bg-gray-50 prose-pre:p-4 prose-pre:shadow-sm hover:prose-pre:shadow-md prose-ul:list-disc prose-ul:space-y-1.5 prose-ul:pl-4 prose-li:leading-7 prose-li:text-gray-600 prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-gray-200 prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-th:text-sm prose-td:border prose-td:border-gray-200 prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-img:mx-auto prose-img:rounded-lg prose-img:shadow-md prose-img:transition-shadow hover:prose-img:shadow-lg prose-hr:my-8 prose-hr:border-gray-200 dark:prose-h1:border-gray-700 dark:prose-h2:text-gray-100 dark:prose-h3:text-gray-200 dark:prose-p:text-gray-300 dark:prose-a:text-blue-400 dark:prose-blockquote:bg-blue-900/20 dark:prose-blockquote:text-gray-300 dark:prose-strong:text-gray-50 dark:prose-code:bg-blue-900/20 dark:prose-code:text-blue-400 dark:prose-pre:border-gray-700/50 dark:prose-pre:bg-gray-800/60 dark:prose-li:text-gray-300 dark:prose-th:border-gray-700 dark:prose-th:bg-gray-800/60 dark:prose-td:border-gray-700 dark:prose-hr:border-gray-700">
        <ReactMarkdown
          components={{
            code({ className, children }) {
              const match = /language-(\w+)/.exec(className || "");
              if (match && match[1] === "mermaid") {
                const mermaidContent = String(children).replace(/\n$/, "");
                const title = extractMermaidTitle(mermaidContent);
                return (
                  <div className="flex flex-col items-center space-y-2">
                    <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                      {title}
                    </h4>
                    <div className="mermaid my-6 flex w-full justify-center">
                      {mermaidContent}
                    </div>
                  </div>
                );
              }
              return <code className={className}>{children}</code>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};
