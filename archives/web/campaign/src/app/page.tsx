'use client'

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GridHoverHero } from "@/app/components/hero/GridHoverHero";
import { Chat } from "@/app/components/chat/Chat";
import { motion } from "framer-motion";
import { BarLoader } from "@/app/components/shared/BarLoader";
import { track } from "@vercel/analytics";

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

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // 上报用户登录事件
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      // 只在本 session 上报一次
      const reported = sessionStorage.getItem("user_login_reported");
      if (!reported) {
        const partner = localStorage.getItem("partner");
        if (partner) {
          track("user_visit_from_partner", {
            name: session.user.name ?? "",
            twitterHandle: session.user.twitterHandle ?? "",
            partner: partner ?? "",
          });
          sessionStorage.setItem("user_login_reported", "1");
        }
      }
    }
  }, [status, session]);

  // 如果用户未登录，则重定向到登录页面
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  // 如果正在加载，则显示加载动画
  if (status === "loading") {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <BarLoader />
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  // 如果用户未登录，则显示登录页面
  if (!session) {
    return <GridHoverHero />;
  }

  return (
    <main className="container mx-auto px-2 sm:px-4 sm:py-4">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="max-w-6xl mx-auto sm:mt-10 md:mt-20"
      >
        <div className="w-full">
          <Chat />
        </div>
      </motion.div>
    </main>
  );
} 