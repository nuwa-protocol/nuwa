interface LoadingScreenProps {
  agentName?: string;
}

export function LoadingScreen({ agentName }: LoadingScreenProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="flex h-full flex-col items-center justify-center space-y-6">
        {/* Logo */}
        <div className="relative h-32 w-32 animate-float">
          <img
            src="/nuwa-logo-horizontal-dark.svg"
            className="hidden h-full w-full object-contain dark:block"
            alt="Nuwa"
          />
          <img
            src="/nuwa-logo-horizontal.svg"
            className="h-full w-full object-contain dark:hidden"
            alt="Nuwa"
          />
        </div>
        {/* Loading Spinner */}
        <div className="flex items-center space-x-3">
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600 [animation-delay:-0.3s]"></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600 [animation-delay:-0.15s]"></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600"></div>
        </div>
        {/* Loading Text */}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {agentName ? `Connecting to ${agentName} assistant...` : "Loading..."}
        </p>
      </div>
    </div>
  );
}
