import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import useAllAgents from '../hooks/use-all-agents'

interface SidebarProps {
  onCollapse: (isCollapsed: boolean) => void
  isCollapsed?: boolean
}

export function Sidebar({ onCollapse, isCollapsed: propIsCollapsed }: SidebarProps) {
  const [localIsCollapsed, setLocalIsCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const { agents } = useAllAgents()

  // Use prop value or local state
  const isCollapsed = propIsCollapsed ?? localIsCollapsed

  // Use unified mock data
  // const agentNames = mockAgents

  const handleCollapse = () => {
    const newCollapsedState = !isCollapsed
    setLocalIsCollapsed(newCollapsedState)
    onCollapse(newCollapsedState)
  }

  return (
    <div
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] dark:bg-gray-900 border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out z-50 ${isCollapsed ? 'w-16 bg-gray-50' : 'w-64 bg-gray-50'
        }`}
    >
      <div className="flex flex-col h-full">
        {/* Collapse Button */}
        <div className={`flex ${isCollapsed ? 'justify-center' : 'justify-end'} px-2 py-2`}>
          <button
            onClick={handleCollapse}
            className="p-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-0 focus:ring-offset-0 transition-colors duration-200 rounded-lg text-gray-600 dark:text-gray-300"
          >
            <div className="relative w-5 h-5">
              <svg
                className={`absolute inset-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              <svg
                className={`absolute inset-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'opacity-0 rotate-180' : 'opacity-100 rotate-0'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </div>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Discover Section */}
          <div
            className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 h-auto'}`}>
            <div className="px-4 pt-2">
              <div className="relative mb-4">
                <MagnifyingGlassIcon
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* AI Characters List */}
              <div
                className="space-y-3 h-[calc(100vh-20rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {agents?.map((agent) => (
                  <div
                    key={agent.username}
                    className="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => navigate(`/agent/${agent.id}`)}
                  >
                    <img
                      src={agent.avatar}
                      alt={agent.name}
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        @{agent.username}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Collapsed State Avatars */}
          <div
            className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'opacity-100 h-auto' : 'opacity-0 h-0 overflow-hidden'}`}>
            <div className="px-2 py-2 space-y-3">
              {agents?.map((agent) => (
                <div
                  key={agent.username}
                  className="flex justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg p-2 transition-colors"
                  onClick={() => navigate(`/agent/${agent.id}`)}
                >
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-10 h-10 rounded-full"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 