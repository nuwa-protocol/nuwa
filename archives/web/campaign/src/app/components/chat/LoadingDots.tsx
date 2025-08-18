import { motion } from "framer-motion";

export const LoadingDots = () => {
    return (
        <div className="flex space-x-2 justify-center items-center">
            {[0, 1, 2].map((index) => (
                <motion.div
                    key={index}
                    className="h-2 w-2 bg-indigo-600 rounded-full"
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: 1 }}
                    transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        repeatType: "reverse",
                        delay: index * 0.2,
                    }}
                />
            ))}
        </div>
    );
}; 