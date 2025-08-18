import React from 'react';
import { ToolInvocationContentProps } from './types';

export const ToolInvocationContent: React.FC<ToolInvocationContentProps> = ({ toolInvocation }) => {
    // 获取工具调用状态
    const state = toolInvocation.state || 'result';

    // 根据状态渲染不同的图标和样式
    const renderStateIndicator = () => {
        switch (state) {
            case 'partial-call':
                return (
                    <div className="animate-pulse flex items-center gap-1 text-amber-500 text-xs mt-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Ready...</span>
                    </div>
                );
            case 'call':
                return (
                    <div className="animate-pulse flex items-center gap-1 text-blue-500 text-xs mt-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Ongoing...</span>
                    </div>
                );
            case 'result':
                return (
                    <div className="flex items-center gap-1 text-green-500 text-xs mt-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Completed</span>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className='bg-blue-50 px-3 py-2 rounded-xl border border-blue-200'>
            <div className="flex items-center gap-2 text-sm">
                <div className="flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <div className="font-medium text-blue-700">
                        Use tool: {toolInvocation.toolName || 'Tool Invocation'}
                    </div>
                    {renderStateIndicator()}
                    {toolInvocation.args && (
                        <div className="text-blue-600 text-xs mt-1">
                            {Object.entries(toolInvocation.args).map(([key, value]) => (
                                <div key={key} className="flex gap-1">
                                    <span className="font-medium">{key}:</span>
                                    <span>{JSON.stringify(value)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

    );
}; 