import React, { useState } from 'react';

interface ExampleScript {
  name: string;
  description: string;
  code: string;
}

interface ExamplesProps {
  examples: ExampleScript[];
  onSelect: (code: string) => void;
}

const Examples: React.FC<ExamplesProps> = ({ examples, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExamples = examples.filter(
    (example) =>
      example.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      example.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-700">
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-gray-200 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-gray-400"
          placeholder="Search examples..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredExamples.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 p-4 text-center">
          <div>
            <p>No examples found matching "{searchQuery}"</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="pt-2">
            {filteredExamples.map((example) => (
              <div
                key={example.name}
                className="sidebar-item mx-3 hover:bg-gray-700 cursor-pointer"
                onClick={() => onSelect(example.code)}
              >
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h3 className="font-medium text-sm text-gray-200 truncate">
                    {example.name}
                  </h3>
                </div>
                <p className="sidebar-item-description text-gray-400 pl-7">
                  {example.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Examples;