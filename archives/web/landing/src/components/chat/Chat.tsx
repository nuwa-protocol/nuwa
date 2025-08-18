import { useState, useRef, useEffect } from 'react';
import { Message as MessageComponent } from './Message';
import { ChatInput } from './ChatInput';
import { useScrollToBottom } from './useScrollToBottom';
import { Greeting } from './Greeting';
import { SuggestedActions } from './SuggestedActions';
import { nanoid } from 'nanoid';

// 定义消息类型
interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
}

export function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();

    // 停止生成
    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsLoading(false);
        }
    };

    // 发送消息
    const handleSubmit = async (overrideInput?: string) => {
        const messageContent = overrideInput || input;
        if (!messageContent.trim() || isLoading) return;

        // 创建用户消息
        const userMessage: Message = {
            id: nanoid(),
            content: messageContent,
            role: 'user'
        };

        // 更新消息列表
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setIsStreaming(false);

        // 创建 AI 响应占位符
        const assistantMessage: Message = {
            id: nanoid(),
            content: '',
            role: 'assistant'
        };

        setMessages(prev => [...prev, assistantMessage]);

        // 创建 AbortController
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;

        try {
            // 发送请求到 API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages.concat(userMessage).map(msg => ({
                        content: msg.content,
                        role: msg.role
                    }))
                }),
                signal
            });

            if (!response.ok) {
                throw new Error(`Error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('Response body is null');
            }

            // 处理 SSE 流
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let streamedResponse = '';

            // 设置流式传输开始
            setIsStreaming(true);
            // 保持加载状态为 true
            setIsLoading(true);

            while (true) {
                if (signal.aborted) break;

                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // 解析 SSE 事件
                chunk.split('\n\n').forEach(part => {
                    if (!part.trim()) return;

                    const eventMatch = part.match(/event: (\w+)\ndata: (.*)/);
                    if (!eventMatch) return;

                    const [, event, data] = eventMatch;
                    if (event === 'text' && data) {
                        try {
                            const parsedData = JSON.parse(data);
                            if (parsedData.text) {
                                streamedResponse += parsedData.text;
                                setMessages(prev =>
                                    prev.map(msg =>
                                        msg.id === assistantMessage.id
                                            ? { ...msg, content: streamedResponse }
                                            : msg
                                    )
                                );
                            }
                        } catch (e) {
                            console.error('Failed to parse JSON:', e);
                        }
                    } else if (event === 'start') {
                        // 收到开始事件时显示加载指示器
                        setIsLoading(true);
                        setIsStreaming(false);
                    } else if (event === 'done') {
                        // 响应完成时结束加载状态
                        setIsLoading(false);
                        setIsStreaming(false);
                    }
                });
            }
        } catch (error) {
            if (signal.aborted) {
                console.log('Request was canceled');
            } else {
                console.error('Error sending message:', error);
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === assistantMessage.id
                            ? { ...msg, content: 'Error: Could not generate a response.' }
                            : msg
                    )
                );
            }
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    };

    // 处理建议选择
    const handleSelectSuggestion = (suggestion: string) => {
        if (isLoading) return;
        handleSubmit(suggestion);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] md:h-[600px] bg-background rounded-xl">
            {/* Messages Container */}
            <div
                ref={messagesContainerRef}
                role="log"
                aria-live="polite"
                className={`flex-1 p-4 space-y-4 bg-white dark:bg-gray-900 max-h-[calc(100vh-300px)] ${messages.length > 0 ? 'overflow-y-scroll' : 'overflow-hidden'
                    }`}
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <Greeting />
                    </div>
                ) : (
                    messages.map((message) => (
                        <MessageComponent
                            key={message.id}
                            content={message.content}
                            role={message.role}
                            isLoading={isLoading && message.id === messages[messages.length - 1]?.id}
                            isStreaming={isStreaming && message.id === messages[messages.length - 1]?.id}
                        />
                    ))
                )}
                <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
            </div>

            {/* Suggested Actions and Input Form */}
            <div className="p-4 space-y-4">
                {messages.length === 0 && (
                    <SuggestedActions onSelectSuggestion={handleSelectSuggestion} />
                )}
                <ChatInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                    isLoading={isLoading}
                />
            </div>
        </div>
    );
} 