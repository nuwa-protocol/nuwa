import React, { useState, useEffect } from "react";
import { TwitterLoginButton } from "@/app/components/auth/TwitterLoginButton";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";
import { FiAward } from "react-icons/fi";
import { PanelHeader } from "@/app/components/shared/PanelHeader";

export const UserProfilePanel = () => {
    const { data: session, status } = useSession();
    const [points, setPoints] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchPoints = async () => {
            if (session?.user?.twitterHandle) {
                try {
                    const response = await fetch('/api/user/points');
                    
                    if (!response.ok) {
                        throw new Error('Failed to fetch user points');
                    }
                    
                    const data = await response.json();
                    setPoints(data.points);
                } catch (error) {
                    console.error("Error fetching user points:", error);
                    setPoints(0);
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };

        if (status === "authenticated") {
            fetchPoints();
        } else {
            setLoading(false);
        }
    }, [session, status]);

    // 创建登出按钮组件
    const LogoutButton = () => (
        <button
            onClick={() => signOut()}
            className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-1 px-3 rounded transition-colors"
        >
            Logout
        </button>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-lg shadow-md mb-6"
        >
            <PanelHeader
                title="Profile"
                rightElement={status === "authenticated" ? <LogoutButton /> : null}
            />
            <div className="p-4">
                <div className="flex flex-col items-center">
                    {status === "loading" || loading ? (
                        <div className="animate-pulse flex space-x-4">
                            <div className="rounded-full bg-gray-200 h-12 w-12"></div>
                            <div className="flex-1 space-y-4 py-1">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="space-y-2">
                                    <div className="h-4 bg-gray-200 rounded"></div>
                                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                                </div>
                            </div>
                        </div>
                    ) : status === "authenticated" ? (
                        <div className="w-full">
                            <div className="flex justify-between items-start">
                                {/* 左侧：头像和用户信息 */}
                                <div className="flex items-center space-x-3">
                                    {session.user?.image && (
                                        <img
                                            src={session.user.image}
                                            alt={session.user.name || "User avatar"}
                                            className="w-12 h-12 rounded-full border-2 border-indigo-500"
                                        />
                                    )}
                                    <div className="text-left">
                                        <p className="font-medium text-lg">{session.user?.name}</p>
                                        <p className="text-sm text-gray-500">@{session.user?.twitterHandle}</p>
                                    </div>
                                </div>

                                {/* 右侧：积分 */}
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-2xl font-bold text-indigo-600">{points}</span>
                                        <FiAward className="text-xl text-indigo-500" />
                                    </div>
                                    <span className="text-sm text-gray-500">Points</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="mb-3 text-gray-600">Login to participate in the activity</p>
                            <TwitterLoginButton />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}; 