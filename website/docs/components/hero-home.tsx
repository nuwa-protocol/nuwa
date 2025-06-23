import Link from "next/link";
import { motion } from "framer-motion";

export default function HeroHome() {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-[calc(100vh-230px)] mx-auto px-4 py-16 text-center">
      {/* Coming Soon Badge */}
      <motion.div
        className="mb-6 flex justify-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.5 }}
      >
        <span className="inline-block rounded-full bg-purple-50 px-5 py-1 text-sm text-purple-600 font-semibold tracking-wide shadow-sm">
          COMING SOON
        </span>
      </motion.div>
      {/* Title */}
      <motion.h1
        className="mb-4 text-3xl sm:text-4xl md:text-6xl font-bold leading-snug sm:leading-tight text-slate-900 dark:text-white"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.7 }}
      >
        <>The Economic Layer for AI Agents</>
      </motion.h1>
      <motion.p
        className="mb-8 text-base sm:text-lg text-gray-700 dark:text-gray-300 max-w-2xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.7 }}
      >
        <>
          Nuwa AI is soon launching the first super AI assistant for you based
          on the{" "}
          <span className="font-bold">
            <a href="/docs">Agent Capability Protocol (ACP)</a>
          </span>
          , enabling frictionless AI agent interactions.
        </>
      </motion.p>
      <motion.div
        className="mb-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7 }}
      >
        <Link
          className="btn px-6 py-3 rounded-lg bg-purple-600 text-white shadow-lg hover:bg-purple-700 transition-all text-lg font-semibold"
          href="/docs"
        >
          Learn More
        </Link>
      </motion.div>
    </section>
  );
}
