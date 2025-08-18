import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { MessageContentProps } from './types';
import { ToolInvocationContent } from './ToolInvocationContent';
import { markdownComponents } from './markdownComponents';
import { TwitterCard } from '@/app/components/chat/TwitterCard';

export const MessageContent: React.FC<MessageContentProps> = ({ part }) => {
    switch (part.type) {
        case 'tool-invocation':
            const { toolInvocation } = part;
            const { toolName, state } = toolInvocation;

            if (state === 'result' && toolName === 'sendPostToTwitterCard') {
                if (toolInvocation.result) {
                    try {
                        const resultData = typeof toolInvocation.result === 'string'
                            ? JSON.parse(toolInvocation.result)
                            : toolInvocation.result;

                        return <TwitterCard content={resultData.content} imageUrl={resultData.imageUrl} />;
                    } catch (error) {
                        console.error('Failed to parse Twitter card data:', error);
                    }
                }
            }

            return <ToolInvocationContent toolInvocation={part.toolInvocation} />;
        case 'text':
            return (
                <div className="prose max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                    >
                        {part.text}
                    </ReactMarkdown>
                </div>
            );
        default:
            return null;
    }
}; 