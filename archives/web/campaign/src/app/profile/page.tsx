'use client'

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserProfilePanel } from "@/app/components/profile/UserProfilePanel";
import { UserPointsHistory } from "@/app/components/profile/UserPointsHistory";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { BarLoader } from "@/app/components/shared/BarLoader";

// 定义淡入动画变体
const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.6,
            ease: "easeOut"
        }
    }
};

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        }
    }, [status, router]);

    if (status === "loading") {
        return (
            <div className="flex justify-center items-center h-screen">
                <BarLoader />
            </div>
        );
    }

    if (!session) {
        return null;
    }

    // 从session中获取Twitter用户名
    const twitterHandle = session.user?.twitterHandle || '';

    return (
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
            <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeInUp}
                className="max-w-6xl mx-auto mt-10 sm:mt-20"
            >
                <div className="w-full">
                    <UserProfilePanel />
                </div>

                <div className="w-full mt-4 sm:mt-8">
                    <UserPointsHistory userName={twitterHandle} />
                </div>
            </motion.div>
        </main>
    );
} 