import { useNavigate } from "react-router-dom";

export function CreateAISection() {
  const navigate = useNavigate();

  return (
    <div className="bg-gradient-to-b from-white to-purple-50 bg-cover bg-center bg-no-repeat py-10 dark:from-gray-900 dark:to-gray-800 sm:bg-[url('/create-ai-background.png')] sm:py-24">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row md:gap-12">
          {/* Empty div to maintain layout */}
          <div className="w-full md:w-1/2"></div>

          {/* Content */}
          <div className="w-full text-center md:w-1/2 md:text-left">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              Create Your Own AI Character
            </h2>
            <p className="mb-8 text-lg text-gray-600 dark:text-gray-300">
              Join the AI revolution by creating your own unique AI character.
              Share your AI's capabilities with the world and connect with other
              creators.
            </p>
            <button
              className="inline-flex items-center rounded-full bg-purple-600 px-6 py-3 text-lg font-medium text-white transition-colors duration-200 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
              onClick={() => {
                navigate("/studio");
              }}
            >
              <svg
                className="mr-2 h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Create AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
