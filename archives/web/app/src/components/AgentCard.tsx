import { Agent } from "../types/agent";
import { useNavigate } from "react-router-dom";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="group cursor-pointer overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
      onClick={() => navigate(`/agent/${agent.username}`)}
    >
      {/* Cover Image */}
      <div className="relative h-20 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 md:h-32">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-pink-600/10"></div>
        {/* Star Button */}
        {/* <div
          className="absolute top-3 right-3 cursor-pointer group/star p-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all duration-200"
          onClick={(e) => {
            e.stopPropagation()
            setIsStarred(!isStarred)
          }}
        >
          {isStarred ? (
            <StarIconSolid className="w-5 h-5 text-yellow-400" />
          ) : (
            <StarIcon className="w-5 h-5 text-white hover:text-yellow-400 transition-colors duration-200" />
          )}
        </div> */}
      </div>

      {/* Profile Section */}
      <div className="flex min-h-[240px] flex-col items-center justify-between px-4 pb-4 md:h-[280px]">
        {/* Avatar and Name Section */}
        <div className="w-full">
          <div className="relative -mt-12 flex flex-col items-center">
            <img
              src={agent.avatar}
              alt={agent.name}
              className="mb-2 h-16 w-16 rounded-full"
            />
            <h3 className="text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
              {agent.name}
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              @{agent.username}
            </div>
          </div>

          {/* Bio with max height and scroll */}
          <p className="mx-auto my-3 max-w-sm overflow-y-auto text-center text-sm text-gray-600 dark:text-gray-300">
            {agent.description}
          </p>
        </div>

        {/* Stats and Button Container */}
        <div className="w-full space-y-4">
          {/* Stats */}
          {/* <div className="flex items-center justify-center space-x-6">
            <div className="flex items-center space-x-1">
              <ChatBubbleLeftIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {0}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <ClockIcon className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {getTimeAgo()}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <FireIcon className="w-4 h-4 text-orange-500" />
              <span className={`text-sm ${getPopularity() >= 85 ? 'text-orange-500 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
                {getPopularity()}%
              </span>
            </div>
            <div
              className="flex items-center space-x-1 cursor-pointer group/like"
              onClick={(e) => {
                e.stopPropagation()
                setIsLiked(!isLiked)
              }}
            >
              {isLiked ? (
                <HeartIconSolid className="w-4 h-4 text-red-500" />
              ) : (
                <HeartIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover/like:text-red-500 transition-colors" />
              )}
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {Math.floor(Math.random() * 1000).toLocaleString()}
              </span>
            </div>
          </div> */}

          {/* Action Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/agent/${agent.username}`);
            }}
            className="group relative w-full overflow-hidden rounded-lg border-2 border-purple-600 bg-white px-8 py-3 text-sm font-semibold transition-all duration-500 ease-in-out dark:bg-gray-900"
          >
            <span className="relative z-10 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent transition-colors duration-500 group-hover:text-white dark:text-white">
              Chat Now
            </span>
            <div className="absolute inset-0 origin-left scale-x-0 transform bg-gradient-to-r from-purple-600 to-pink-600 transition-transform duration-500 ease-in-out group-hover:scale-x-100"></div>
            <div className="absolute inset-0 origin-right scale-x-0 transform bg-gradient-to-r from-purple-600 to-pink-600 transition-transform delay-100 duration-500 ease-in-out group-hover:scale-x-100"></div>
          </button>
        </div>
      </div>
    </div>
  );
}
