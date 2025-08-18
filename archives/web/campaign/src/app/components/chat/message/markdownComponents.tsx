import React from 'react';
import { TiltImageCard } from '../TiltImageCard';

export const markdownComponents = {
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
                <span className="block text-red-500 text-sm my-4">
                    Invalid image source
                </span>
            );
        }

        return (
            <span className="block my-4 w-full">
                {isError ? (
                    <span className="block text-red-500 text-sm">
                        Failed to load image: {alt}
                    </span>
                ) : (
                    <TiltImageCard
                        src={src}
                        alt={alt || ''}
                        onError={() => setIsError(true)}
                    />
                )}
            </span>
        );
    },
}; 