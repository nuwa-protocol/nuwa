import { SiGithub } from "@icons-pack/react-simple-icons";
import { SiX } from "@icons-pack/react-simple-icons";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
          <span>© Copyright 2025 Root Branch Labs, LTD.</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <a
            href="https://github.com/rooch-network/nuwa"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-purple-600 dark:hover:text-purple-400"
          >
            <SiGithub className="h-5 w-5 text-black hover:text-purple-600" />
          </a>
          <a
            href="https://x.com/NuwaDev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-purple-600 dark:hover:text-purple-400"
          >
            <SiX className="h-5 w-5 text-black hover:text-purple-600" />
          </a>
        </div>
      </div>
    </footer>
  );
}
