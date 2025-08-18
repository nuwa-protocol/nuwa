'use client'

import React, { useState, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SOCIAL_CTAS } from "./NavigationWrapper";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { navItems } from "./NavigationWrapper";
import Image from "next/image";
import { MobileNavContext } from "@/app/components/navigation/MobileNavContext";
import { useMessages } from "@/app/context/MessagesContext";
import { useGridCards } from "@/app/context/GridCardsContext";

export const MobileNav = () => {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const { active, setActive } = useContext(MobileNavContext);
    const { hasMessages } = useMessages();
    const { showGridCards } = useGridCards();

    // 检查当前路径是否匹配任何导航项
    const isPathValid = navItems.some(item => pathname === item.path);

    // 如果用户未登录或路径无效，返回 null
    if (status === "unauthenticated" || !session || !isPathValid) {
        return null;
    }

    // 如果有消息或显示任务网格卡片，不显示导航按钮
    if (hasMessages || showGridCards) {
        return null;
    }

    return (
        <>
            <HamburgerButton active={active} setActive={setActive} />
            <AnimatePresence>{active && <LinksOverlay />}</AnimatePresence>
        </>
    );
};

const LinksOverlay = () => {
    return (
        <motion.nav
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed right-4 top-4 z-40 h-dvh w-[calc(100%_-_32px)] overflow-hidden"
        >
            <AnimatePresence mode="wait">
                <motion.div key="logo">
                    <Logo />
                </motion.div>
                <motion.div key="links">
                    <LinksContainer />
                </motion.div>
                <motion.div key="footer">
                    <FooterCTAs />
                </motion.div>
            </AnimatePresence>
        </motion.nav>
    );
};

const LinksContainer = () => {
    const { setActive } = useContext(MobileNavContext);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 p-12 pl-4 md:pl-20"
        >
            {navItems.map((item, idx) => {
                return (
                    <NavLink key={item.path} href={item.path} idx={idx} onClick={() => setActive(false)}>
                        {item.title}
                    </NavLink>
                );
            })}
        </motion.div>
    );
};

interface NavLinkProps {
    children: React.ReactNode;
    href: string;
    idx: number;
    onClick: () => void;
}

const NavLink = ({ children, href, idx, onClick }: NavLinkProps) => {
    const pathname = usePathname();
    const isActive = pathname === href;

    const MotionLink = motion(Link);

    return (
        <MotionLink
            initial={{ opacity: 0, y: -8 }}
            animate={{
                opacity: 1,
                y: 0,
                transition: {
                    delay: 0.3 + idx * 0.125,
                    duration: 0.2,
                    ease: "easeInOut",
                },
            }}
            exit={{
                opacity: 0,
                y: -8,
                transition: {
                    duration: 0.2,
                    ease: "easeInOut",
                }
            }}
            href={href}
            onClick={onClick}
            className={`block text-5xl font-semibold transition-colors md:text-7xl ${isActive
                ? "text-white"
                : "text-violet-400 hover:text-violet-50"
                }`}
        >
            {children}.
        </MotionLink>
    );
};

const Logo = () => {
    return (
        <motion.a
            initial={{ opacity: 0, y: -12 }}
            animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.5, duration: 0.5, ease: "easeInOut" },
            }}
            exit={{ opacity: 0, y: -12 }}
            href="/"
            className="grid h-20 w-20 place-content-center rounded-br-xl rounded-tl-xl bg-white transition-colors hover:bg-violet-50"
        >
            <Image
                src="/nuwa.svg"
                alt="Nuwa Logo"
                width={50}
                height={50}
                className="fill-violet-600"
            />
        </motion.a>
    );
};

interface HamburgerButtonProps {
    active: boolean;
    setActive: React.Dispatch<React.SetStateAction<boolean>>;
}

const HamburgerButton = ({ active, setActive }: HamburgerButtonProps) => {
    return (
        <>
            <motion.div
                initial={false}
                animate={active ? "open" : "closed"}
                variants={UNDERLAY_VARIANTS}
                style={{ top: 16, right: 16 }}
                className="fixed z-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 shadow-lg shadow-violet-800/20"
            />

            <motion.button
                initial={false}
                animate={active ? "open" : "closed"}
                onClick={() => setActive((pv: boolean) => !pv)}
                className={`group fixed right-4 top-4 z-50 h-12 w-12 bg-white/0 transition-all  ${active ? "rounded-bl-xl rounded-tr-xl hover:bg-white/20" : "rounded-xl hover:bg-white/0"
                    }`}
            >
                <motion.span
                    variants={HAMBURGER_VARIANTS.top}
                    className="absolute block h-0.5 w-6 bg-white"
                    style={{ y: "-50%", left: "50%", x: "-50%" }}
                />
                <motion.span
                    variants={HAMBURGER_VARIANTS.middle}
                    className="absolute block h-0.5 w-6 bg-white"
                    style={{ left: "50%", x: "-50%", top: "50%", y: "-50%" }}
                />
                <motion.span
                    variants={HAMBURGER_VARIANTS.bottom}
                    className="absolute block h-0.5 w-3 bg-white"
                    style={{ x: "-50%", y: "50%" }}
                />
            </motion.button>
        </>
    );
};

const FooterCTAs = () => {
    return (
        <div className="absolute top-6 left-24 flex gap-4">
            {SOCIAL_CTAS.map((l, idx) => {
                return (
                    <motion.a
                        key={idx}
                        href={l.href}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            transition: {
                                delay: 1 + idx * 0.125,
                                duration: 0.5,
                                ease: "easeInOut",
                            },
                        }}
                        exit={{ opacity: 0, y: -8 }}
                    >
                        <l.Component className="text-xl text-white transition-colors hover:text-violet-300" />
                    </motion.a>
                );
            })}
        </div>
    );
};

const UNDERLAY_VARIANTS = {
    open: {
        width: "calc(100% - 32px)",
        height: "calc(100vh - 32px)",
        transition: { type: "spring", mass: 2, stiffness: 500, damping: 40 },
    },
    closed: {
        width: "48px",
        height: "48px",
        transition: {
            delay: 0.3,
            type: "spring",
            mass: 2,
            stiffness: 500,
            damping: 40,
        },
    },
};

const HAMBURGER_VARIANTS = {
    top: {
        open: {
            rotate: ["0deg", "0deg", "45deg"],
            top: ["35%", "50%", "50%"],
            transition: { duration: 0.2 }
        },
        closed: {
            rotate: ["45deg", "0deg", "0deg"],
            top: ["50%", "50%", "35%"],
            transition: { duration: 0.2 }
        },
    },
    middle: {
        open: {
            rotate: ["0deg", "0deg", "-45deg"],
            transition: { duration: 0.2 }
        },
        closed: {
            rotate: ["-45deg", "0deg", "0deg"],
            transition: { duration: 0.2 }
        },
    },
    bottom: {
        open: {
            rotate: ["0deg", "0deg", "45deg"],
            bottom: ["35%", "50%", "50%"],
            left: "50%",
            transition: { duration: 0.2 }
        },
        closed: {
            rotate: ["45deg", "0deg", "0deg"],
            bottom: ["50%", "50%", "35%"],
            left: "calc(50% + 5px)",
            transition: { duration: 0.2 }
        },
    },
}; 