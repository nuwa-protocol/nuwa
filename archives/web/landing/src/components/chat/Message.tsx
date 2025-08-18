import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { LoadingDots } from './LoadingDots';
import 'katex/dist/katex.min.css';
import React from 'react';
import Image from 'next/image';

interface MessageProps {
    content: string;
    role: 'user' | 'assistant';
    isLoading?: boolean;
    isStreaming?: boolean;
}

const markdownComponents = {
    code: ({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        return !inline && match ? (
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto max-w-full">
                <code className={className} {...props}>
                    {children}
                </code>
            </pre>
        ) : (
            <code className="bg-muted px-1 py-0.5 rounded" {...props}>
                {children}
            </code>
        );
    },
    pre: ({ children }: any) => <>{children}</>,
    a: ({ node, children, ...props }: any) => (
        <a
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noreferrer"
            {...props}
        >
            {children}
        </a>
    ),
    p: ({ children }: any) => <p className="mb-4 last:mb-0">{children}</p>,
    ul: ({ children }: any) => (
        <ul className="list-disc list-outside ml-4 mb-4">{children}</ul>
    ),
    ol: ({ children }: any) => (
        <ol className="list-decimal list-outside ml-4 mb-4">{children}</ol>
    ),
    li: ({ children }: any) => <li className="mb-1">{children}</li>,
    h1: ({ children }: any) => (
        <h1 className="text-2xl font-bold mb-4">{children}</h1>
    ),
    h2: ({ children }: any) => (
        <h2 className="text-xl font-bold mb-3">{children}</h2>
    ),
    h3: ({ children }: any) => (
        <h3 className="text-lg font-bold mb-2">{children}</h3>
    ),
    blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-muted pl-4 italic mb-4">
            {children}
        </blockquote>
    ),
    img: ({ node, src, alt, ...props }: any) => {
        const [isError, setIsError] = React.useState(false);

        if (!src) {
            return (
                <div className="text-red-500 text-sm my-4">
                    Invalid image source
                </div>
            );
        }

        return (
            <div className="relative my-4 w-full">
                {isError ? (
                    <div className="text-red-500 text-sm">
                        Failed to load image: {alt}
                    </div>
                ) : (
                    <div className="relative w-full aspect-video">
                        <Image
                            src={src}
                            alt={alt || ''}
                            fill
                            className="object-contain rounded-lg"
                            onError={() => setIsError(true)}
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            priority={false}
                        />
                    </div>
                )}
            </div>
        );
    },
};

export function Message({
    content,
    role,
    isLoading,
    isStreaming = false,
}: MessageProps) {
    return (
        <AnimatePresence>
            <motion.div
                data-testid={`message-${role}`}
                className="w-full mx-auto px-4 group/message"
                initial={{ y: 5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                data-role={role}
            >
                <div
                    className={`flex gap-4 w-full ${role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                >
                    {role === 'assistant' && (
                        <div className="size-10 flex items-center rounded-full justify-center shrink-0">
                            <img
                                src="/nuwa.svg"
                                alt="Nuwa Logo"
                                className="size-6"
                            />
                        </div>
                    )}

                    <div className={`flex flex-col gap-4 ${role === 'user'
                        ? 'items-end max-w-2xl md:max-w-3xl'
                        : 'w-full'
                        }`}>
                        <div className="flex flex-row gap-2 items-start">
                            <div
                                data-testid="message-content"
                                className={`flex flex-col gap-4 ${role === 'user'
                                    ? 'bg-indigo-600 text-white [&_*]:text-white px-3 py-2 rounded-xl'
                                    : 'bg-muted px-3 py-2 rounded-xl'
                                    }`}
                            >
                                <div className="prose dark:prose-invert max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={markdownComponents}
                                    >
                                        {content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>

                        {isLoading && !isStreaming && role === 'assistant' && (
                            <div className="flex items-center justify-center">
                                <LoadingDots />
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
} 