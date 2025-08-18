'use client'

import React, { useState, useEffect } from "react";
import { FloatingNav } from "./FloatingNav";
import { MobileNav } from "./MobileNav";
import { SiGithub, SiInstagram, SiLinkedin, SiYoutube } from "react-icons/si";
import { FaXTwitter } from "react-icons/fa6";
import { MobileNavProvider } from "./MobileNavContext";
import { FiHome, FiAward, FiUser } from "react-icons/fi";
import { IconType } from "react-icons";

export interface NavItem {
    title: string;
    icon: IconType;
    path: string;
}

export const navItems: NavItem[] = [
    {
        title: "Home",
        icon: FiHome,
        path: "/",
    },
    {
        title: "Leaderboard",
        icon: FiAward,
        path: "/leaderboard",
    },
    {
        title: "My Profile",
        icon: FiUser,
        path: "/profile",
    },
];

export const SOCIAL_CTAS = [
    {
        Component: FaXTwitter,
        href: "https://twitter.com/NuwaDev",
    },
    {
        Component: SiGithub,
        href: "https://github.com/rooch-network/nuwa",
    },
];

export const NavigationWrapper = ({ children }: { children: React.ReactNode }) => {
    const [isMobile, setIsMobile] = useState(false);

    // 检查是否为移动设备
    useEffect(() => {
        const checkIfMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        // 初始检查
        checkIfMobile();

        // 添加窗口大小变化监听器
        window.addEventListener('resize', checkIfMobile);

        // 清理函数
        return () => window.removeEventListener('resize', checkIfMobile);
    }, []);

    return (
        <MobileNavProvider>
            <div className="relative">
                {/* 桌面端导航 - 只在非移动设备上显示 */}
                {!isMobile && <FloatingNav />}

                {/* 移动端导航 - 只在移动设备上显示 */}
                {isMobile && <MobileNav />}

                {children}
            </div>
        </MobileNavProvider>
    );
}; 