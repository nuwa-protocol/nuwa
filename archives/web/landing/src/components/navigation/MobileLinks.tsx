import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LinkType } from "@/components/navigation/DesktopLinks";
import Link from 'next/link';

export const MobileLinks = ({
  links,
  open,
}: {
  links: LinkType[];
  open: boolean;
}) => {
  return (
    <AnimatePresence mode="popLayout">
      {open && (
        <motion.div
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          className="grid grid-cols-1 gap-6 py-6 md:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.title}
              href={l.href}
              className="text-md block font-semibold text-zinc-950 hover:text-indigo-600"
            >
              {l.title}
            </Link>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
