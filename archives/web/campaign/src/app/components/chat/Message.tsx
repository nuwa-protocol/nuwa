import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UIMessage } from 'ai';
import { Avatar } from './message/Avatar';
import { MessageContent } from './message/MessageContent';
import { getMessageContainerClass, getMessageContentClass, getMessageBubbleClass } from './message/styles';

interface MessageProps {
    message: UIMessage;
}

export function Message({ message }: MessageProps) {
    const { role, parts } = message;

    return (
        <AnimatePresence>
            <motion.div
                data-testid={`message-${role}`}
                className="w-full mx-auto px-4 group/message"
                initial={{ y: 5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                data-role={role}
            >
                <div className={`flex flex-col sm:flex-row w-full ${getMessageContainerClass(role)}`}>
                    <div className="hidden sm:flex justify-start sm:justify-start">
                        <Avatar role={role} />
                    </div>

                    <div className={`flex flex-col gap-2 ${getMessageContentClass(role)}`}>
                        <div className="flex flex-col gap-2">
                            {parts.map((part, i) => {
                                if (part.type !== 'text' && part.type !== 'tool-invocation') {
                                    return null;
                                }
                                // 在移动端不显示 tool-invocation
                                if (part.type === 'tool-invocation') {
                                    return (
                                        <div
                                            key={`${message.id}-${i}`}
                                            className={`hidden sm:flex flex-col ${getMessageBubbleClass(role)}`}
                                        >
                                            <MessageContent
                                                part={{
                                                    type: part.type,
                                                    text: 'text' in part ? (part.text as string) : undefined,
                                                    toolInvocation: 'toolInvocation' in part ? part.toolInvocation : undefined
                                                }}
                                            />
                                        </div>
                                    );
                                }
                                return (
                                    <div
                                        key={`${message.id}-${i}`}
                                        className={`flex flex-col ${getMessageBubbleClass(role)}`}
                                    >
                                        <MessageContent
                                            part={{
                                                type: part.type,
                                                text: 'text' in part ? (part.text as string) : undefined,
                                                toolInvocation: 'toolInvocation' in part ? part.toolInvocation : undefined
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
} 