import { motion } from 'framer-motion';
import { useMissions } from '../../context/MissionsContext';

interface SuggestedMissionsProps {
    onSelectSuggestion: (suggestion: string) => void;
}

export function SuggestedMissions({ onSelectSuggestion }: SuggestedMissionsProps) {
    const { missions, loading, error } = useMissions();
    // Filter suggested missions while preserving original order
    const suggestedMissions = missions.filter(mission => mission.suggested);

    if (loading) {
        return <div className="text-center py-4">Loading missions...</div>;
    }

    if (error) {
        return <div className="text-center py-4 text-red-500">Failed to load missions</div>;
    }

    if (suggestedMissions.length === 0) {
        return <div className="text-center py-4">No suggested missions available</div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="grid grid-cols-2 gap-2 w-full mt-4"
        >
            {suggestedMissions.map((mission, index) => (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ delay: 1.2 + 0.1 * index }}
                    key={`suggestion-${mission.id}`}
                    className={index > 1 ? 'hidden sm:block' : 'block'}
                >
                    <button
                        onClick={() => onSelectSuggestion(mission.suggestionText)}
                        className="text-left border border-gray-200 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm w-full h-auto flex flex-col justify-start items-start hover:bg-gray-100 transition-colors"
                    >
                        <span className="font-medium">{mission.title}</span>
                        <span className="text-gray-500">
                            {mission.description}
                        </span>
                    </button>
                </motion.div>
            ))}
        </motion.div>
    );
} 