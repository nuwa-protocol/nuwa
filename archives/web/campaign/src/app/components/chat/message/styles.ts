import { MessageRole, MessagePartType } from './types';

export const getMessageContainerClass = (role: MessageRole): string => {
    switch (role) {
        case 'user':
            return 'justify-end';
        default:
            return 'justify-start';
    }
};

export const getMessageContentClass = (role: MessageRole): string => {
    switch (role) {
        case 'user':
            return 'items-end justify-end sm:max-w-2xl md:max-w-3xl';
        default:
            return 'w-full';
    }
};

export const getMessageBubbleClass = (role: MessageRole): string => {
    switch (role) {
        case 'user':
            return 'bg-indigo-600 items-end justify-end  text-white [&_*]:text-white px-3 py-2 rounded-xl';
        default:
            return 'bg-muted md:px-3 py-2 rounded-xl';
    }
}; 