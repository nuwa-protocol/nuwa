import Link from "next/link";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start max-w-2xl">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">CapUI Demo</h1>
        </div>

        <p className="text-lg text-center sm:text-left text-gray-600 dark:text-gray-300">
          A demonstration of the CAPUI component library with interactive examples and MCP integration.
        </p>

        <div className="flex flex-col gap-4 w-full">
          <h2 className="text-xl font-semibold">Demo Pages</h2>
          <div className="grid gap-3">
            <Link
              href="/weather"
              className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-between hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent p-4"
            >
              <div>
                <h3 className="font-medium">Weather Component</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Interactive weather display with location-based forecast</p>
              </div>
              <span className="text-gray-400">→</span>
            </Link>
            <Link
              href="/test"
              className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-between hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent p-4"
            >
              <div>
                <h3 className="font-medium">Test Page</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Component development and testing area</p>
              </div>
              <span className="text-gray-400">→</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full">
          <h2 className="text-xl font-semibold">MCP Integration</h2>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
            <h3 className="font-medium mb-2">API Endpoint</h3>
            <code className="bg-black/[.05] dark:bg-white/[.06] font-mono text-sm px-2 py-1 rounded">
              /api/mcp
            </code>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              MCP server endpoint for the <code className="bg-black/[.05] dark:bg-white/[.06] font-mono text-xs px-1 py-0.5 rounded">show_weather_ui</code> tool
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
