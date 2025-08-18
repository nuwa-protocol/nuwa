'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { navItems } from "./NavigationWrapper";
import Image from "next/image";

export const FloatingNav = () => {
    const pathname = usePathname();
    const { data: session, status } = useSession();

    // 检查当前路径是否匹配任何导航项
    const isPathValid = navItems.some(item => pathname === item.path);
    if (!isPathValid) {
        return null;
    }

    // 如果用户未登录，返回 null
    if (status === "unauthenticated" || !session) {
        return null;
    }

    return (
        <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed top-4 z-50 w-full flex justify-center"
        >
            <div className="flex items-center justify-center space-x-4 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-slate-200">
                <Image
                    src="/nuwa.svg"
                    alt="Nuwa Logo"
                    width={30}
                    height={30}
                    className="mr-2"
                />
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        href={item.path}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all duration-200 ${pathname === item.path
                            ? "bg-violet-600 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                            }`}
                    >
                        <item.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{item.title}</span>
                    </Link>
                ))}
            </div>
        </motion.div>
    );
}; 