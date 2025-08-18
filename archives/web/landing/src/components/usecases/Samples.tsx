import React from "react";
import { OPTIONS } from "./options";
import { AnimatePresence } from "framer-motion";

export const Samples = ({ selected }: { selected: number }) => {
  // 确保 selected 在有效范围内
  const safeSelected = Math.min(Math.max(0, selected), OPTIONS.length - 1);
  const { Content } = OPTIONS[safeSelected];

  return (
    <div className="w-full translate-y-2 rounded-lg bg-zinc-900">
      <AnimatePresence mode="wait">
        <Content key={safeSelected} />
      </AnimatePresence>
    </div>
  );
};
