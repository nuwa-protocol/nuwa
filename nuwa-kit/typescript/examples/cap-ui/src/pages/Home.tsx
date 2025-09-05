import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start max-w-2xl">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Cap UI Examples</h1>
        </div>

        <p className="text-lg text-center sm:text-left text-gray-600 dark:text-gray-300">
          Explore three different types of Cap UI implementations showcasing the <code>@nuwa-ai/ui-kit</code> SDK capabilities.
        </p>

        <div className="w-full p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">🌐 Try Live Examples</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
            Test these UIs in a real Nuwa environment without any setup:
          </p>
          <a 
            href="https://test-app.nuwa.dev/studio/mcp" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
          >
            https://test-app.nuwa.dev/studio/mcp ↗️
          </a>
        </div>

        <div className="flex flex-col gap-4 w-full">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">🌟 Three Example Types</h2>
          <div className="grid gap-3">
            <Link
              to="/weather"
              className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-between hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent p-4"
            >
              <div>
                <h3 className="font-medium flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  🌤️ Weather App <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">Pure UI</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Basic Cap UI styling and layout patterns • No external communication</p>
              </div>
              <span className="text-gray-400 dark:text-gray-500">→</span>
            </Link>
            <Link
              to="/demo"
              className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-between hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent p-4"
            >
              <div>
                <h3 className="font-medium flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  💬 Demo App <span className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">One-way</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Call Nuwa Client functions • Send prompts, selections & state management</p>
              </div>
              <span className="text-gray-400 dark:text-gray-500">→</span>
            </Link>
            <Link
              to="/note"
              className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-between hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent p-4"
            >
              <div>
                <h3 className="font-medium flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  📝 Note App <span className="text-xs bg-green-100 dark:bg-green-900 px-2 py-1 rounded">Bidirectional</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Full MCP integration • AI can read and control the note interface</p>
              </div>
              <span className="text-gray-400 dark:text-gray-500">→</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full text-sm text-gray-500 dark:text-gray-400">
          <p className="font-medium">📖 Recommended Learning Path:</p>
          <p>Start with <strong>Weather</strong> → Move to <strong>Demo</strong> → Master <strong>Note</strong></p>
        </div>
      </main>
    </div>
  );
}