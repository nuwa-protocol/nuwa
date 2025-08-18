import React, { ReactNode, useState } from "react";
import { motion } from "framer-motion";
import { FiMenu, FiArrowRight } from "react-icons/fi";
import { Logo } from "./Logo";
import { DesktopLinks, LinkType } from "./DesktopLinks";
import { MobileLinks } from "./MobileLinks";
import { Announcement } from "./Announcement";
import { Button } from "../shared/Button";
import Link from 'next/link';

export const ExpandableNavBar = ({
  children,
  links,
}: {
  children?: ReactNode;
  links: LinkType[];
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <div className="bg-indigo-600 pt-2">
        {/* <Announcement /> */}
        <nav className="rounded-t-2xl bg-white p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <Logo />
              <DesktopLinks links={links} />
            </div>
            <Link
              href="https://test.nuwa.dev/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className="hidden md:block"
                intent="secondary"
                size="small"
              >
                <span className="font-bold flex items-center">
                  Try Nuwa Alpha
                  <FiArrowRight className="ml-1" />
                </span>
              </Button>
            </Link>
            <button
              onClick={() => setMobileNavOpen((pv) => !pv)}
              className="mt-0.5 block text-2xl md:hidden"
            >
              <FiMenu />
            </button>
          </div>
          <MobileLinks links={links} open={mobileNavOpen} />
        </nav>
      </div>
      <motion.main layout>
        <div className="bg-white">{children}</div>
      </motion.main>
    </>
  );
};
