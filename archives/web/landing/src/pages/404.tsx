import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";

const NotFoundPage = () => {
    return (
        // Overflow hidden is required to properly display the fuzzy overlay effect
        <div className="relative overflow-hidden">
            <NotFoundContent />
            <FuzzyOverlay />
        </div>
    );
};

const FuzzyOverlay = () => {
    return (
        <motion.div
            initial={{ transform: "translateX(-10%) translateY(-10%)" }}
            animate={{
                transform: "translateX(10%) translateY(10%)",
            }}
            transition={{
                repeat: Infinity,
                duration: 0.2,
                ease: "linear",
                repeatType: "mirror",
            }}
            style={{
                backgroundImage: 'url("/black-noise.png")',
            }}
            className="pointer-events-none absolute -inset-[100%] opacity-[15%]"
        />
    );
};

const NotFoundContent = () => {
    return (
        <div className="relative grid h-screen place-content-center space-y-6 bg-neutral-950 p-8">
            <p className="text-center text-8xl font-black text-neutral-50">
                404
            </p>
            <p className="text-center text-6xl font-bold text-neutral-300">
                Page Not Found
            </p>
            <p className="text-center text-neutral-400">
                The page you are looking for does not exist or has been removed
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
                <Link href="/" className="w-fit bg-neutral-200 px-4 py-2 font-semibold text-neutral-700 transition-colors hover:bg-neutral-50">
                    Back to Home
                </Link>
            </div>
        </div>
    );
};

export default NotFoundPage; 