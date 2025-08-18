import React from 'react';

interface OutputProps {
  output: string;
  error: string | null;
  loading: boolean;
  onClear?: () => void;
}

const Output: React.FC<OutputProps> = ({ output, error, loading, onClear }) => {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 output-section">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-500 mb-3"></div>
        <p>Executing script...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-3 output-section w-full">
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm">
          <div className="flex items-center mb-2">
            <svg className="h-5 w-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span className="font-medium text-red-800">Error</span>
          </div>
          <pre className="whitespace-pre-wrap text-red-700 font-mono text-xs p-2 bg-red-100 rounded overflow-auto">
            {error}
          </pre>
        </div>
        {onClear && (
          <div className="mt-3 flex justify-end">
            <button 
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }
  
  if (output) {
    return (
      <div className="p-3 output-section w-full">
        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-white p-3 rounded-md border border-gray-200 overflow-auto">
          {output}
        </pre>
        {onClear && (
          <div className="mt-3 flex justify-end">
            <button 
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }
  
  // 空状态直接返回null，不渲染任何内容，因为在父组件中已经处理了
  return null;
};

export default Output;