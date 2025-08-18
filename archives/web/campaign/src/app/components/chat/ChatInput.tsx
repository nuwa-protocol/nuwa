import { useRef, useEffect, useState } from 'react';

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    isStreaming?: boolean;
}

export function ChatInput({ value, onChange, onSubmit, onStop, isStreaming }: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (textareaRef.current) {
            adjustHeight();
        }
    }, [value]);

    const adjustHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className="relative w-full">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Send a message..."
                aria-label="Chat input"
                className={`w-full min-h-[24px] max-h-[calc(75dvh)] p-3 pb-10 resize-none rounded-2xl bg-gray-100 border border-input focus:outline-none focus:ring-2 focus:ring-black focus:bg-white placeholder:text-muted-foreground text-base shadow-md hover:shadow-lg transition-shadow ${isFocused ? 'ring-2 ring-black' : ''
                    }`}
                rows={2}
            />

            <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {isStreaming && onStop && (
                    <button
                        onClick={onStop}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                        aria-label="Stop generation"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect width="14" height="14" x="5" y="5" />
                        </svg>
                    </button>
                )}

                <button
                    onClick={onSubmit}
                    disabled={isStreaming || !value.trim()}
                    className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                    aria-label="Send message"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                    </svg>
                </button>
            </div>
        </div>
    );
} 