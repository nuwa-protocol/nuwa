import { motion } from 'framer-motion';

interface SuggestedActionsProps {
    onSelectSuggestion: (suggestion: string) => void;
}

export function SuggestedActions({ onSelectSuggestion }: SuggestedActionsProps) {
    const suggestedActions = [
        {
            title: "Twitter Score",
            label: "Help me to evaluate my twitter score",
            action: "I need help to evaluate my twitter score",
        },
        {
            title: "Fortune Telling",
            label: "Help me to evaluate my fortune",
            action: "I need help to evaluate my fortune",
        },
        {
            title: "Content Competition",
            label: "I created content!",
            action: "Help me to evaluate my content competition",
        },
        {
            title: "Meme Competition",
            label: "I created Meme!",
            action: "Help me to evaluate my meme competition",
        },
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mt-4"
        >
            {suggestedActions.map((suggestion, index) => (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ delay: 1.2 + 0.1 * index }}
                    key={`suggestion-${index}`}
                    className={index > 1 ? 'hidden sm:block' : 'block'}
                >
                    <button
                        onClick={() => onSelectSuggestion(suggestion.action)}
                        className="text-left border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm w-full h-auto flex flex-col justify-start items-start hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <span className="font-medium">{suggestion.title}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                            {suggestion.label}
                        </span>
                    </button>
                </motion.div>
            ))}
        </motion.div>
    );
} 