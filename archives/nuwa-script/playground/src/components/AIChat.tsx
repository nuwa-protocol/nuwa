import React, { useState, useRef, useEffect } from 'react';
import { BoltIcon, XIcon } from './AppIcons';

interface AIChatProps {
  onSendMessage: (message: string) => Promise<void>;
  messages: Array<{ role: string; content: string }>;
  isProcessing: boolean;
  apiKeySet: boolean;
}

const AIChat: React.FC<AIChatProps> = ({ 
  onSendMessage, 
  messages, 
  isProcessing, 
  apiKeySet,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      const message = input;
      setInput('');
      await onSendMessage(message);
    }
  };

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="h-full flex flex-col rounded-md shadow-sm bg-white dark:bg-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
        <div className="flex items-center">
          <BoltIcon size="small" className="text-purple-500 dark:text-purple-400 w-5 h-5 mr-2" />
          <h3 className="text-base font-medium text-gray-700 dark:text-slate-200">AI Assistant</h3>
        </div>
        <div className="flex items-center">
          {isProcessing && (
            <span className="flex items-center text-xs text-purple-700 dark:text-purple-400 animate-pulse">
              <span className="relative flex h-2 w-2 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              Thinking...
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 message-container" style={{ scrollBehavior: 'smooth' }}>
        {messages.length === 0 && !apiKeySet ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 dark:text-slate-400 animate-fadeIn">
            <div className="welcome-icon">
              <XIcon size="medium" className="text-slate-400 dark:text-slate-600 mb-4" />
            </div>
            <h4 className="font-medium text-lg mb-2 text-slate-700 dark:text-slate-300">Welcome to NuwaScript AI Assistant</h4>
            <p className="mb-2">Enter your OpenAI API key to get started</p>
            <p className="text-xs max-w-sm opacity-75">If you don't have an API key, you can get one from the <a href="https://platform.openai.com/" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">OpenAI platform</a></p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div
                className={`inline-block max-w-full w-fit rounded-lg px-4 py-2 text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : message.role === 'system'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                } whitespace-pre-wrap break-words overflow-hidden`}
                style={{ 
                  maxWidth: '100%', 
                  overflowWrap: 'break-word',
                  wordWrap: 'break-word',
                  wordBreak: 'break-all'
                }}
              >
                <div className="break-all max-w-full">
                  {message.content.includes('```') 
                    ? formatWithCodeBlocks(message.content)
                    : message.content}
                </div>
              </div>
            </div>
          ))
        )}
        {messages.length === 0 && apiKeySet && (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 dark:text-slate-400">
                <p>Ask the AI to generate a script based on the available tools!</p>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 dark:border-slate-700">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={!apiKeySet ? "Enter OpenAI API key (sk-...)" : "Ask AI to generate script..."}
            disabled={isProcessing}
            rows={3}
            className="w-full pl-4 pr-12 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 disabled:opacity-60 text-sm shadow-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 bottom-2 p-1.5 rounded-full text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 disabled:opacity-40 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};

// Helper function: Format messages containing code blocks
function formatWithCodeBlocks(content: string) {
  const segments = content.split(/(```[\s\S]*?```)/g);
  
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          // Extract language and code
          const match = segment.match(/```(\w*)\n([\s\S]*?)```/);
          const language = match?.[1] || '';
          const code = match?.[2] || segment.slice(3, -3);
          
          return (
            <div key={i} className="my-2 rounded-md overflow-hidden bg-slate-800 text-slate-200 dark:bg-slate-900 max-w-full break-all">
              {language && (
                <div className="px-4 py-1 bg-slate-700 dark:bg-slate-800 text-xs font-mono break-all">
                  {language}
                </div>
              )}
              <pre className="p-4 text-xs overflow-auto max-w-full break-all" style={{ 
                maxWidth: '100%',
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word'
              }}>
                <code className="block max-w-full break-all whitespace-pre-wrap">{code}</code>
              </pre>
            </div>
          );
        } else {
          return <span key={i} className="break-all">{segment}</span>;
        }
      })}
    </>
  );
}

export default AIChat;