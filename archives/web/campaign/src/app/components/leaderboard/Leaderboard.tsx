'use client'

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { FiAward } from "react-icons/fi";
import { LeaderboardUser } from "@/app/services/supabaseService";
import { BarLoader } from "@/app/components/shared/BarLoader";
import { PanelHeader } from "@/app/components/shared/PanelHeader";

const TableRows = ({ user }: { user: LeaderboardUser }) => {
    return (
        <motion.tr
            layoutId={`row-${user.id}`}
            className={`text-sm ${(user.rank ?? 0) % 2 === 0 ? "bg-white" : "bg-slate-100"}`}
        >
            <td className="p-2 sm:p-4">
                <div
                    className={`flex items-center justify-center gap-2 font-medium`}
                >
                    <span>#{user.rank}</span>
                </div>
            </td>

            <td className="p-2 sm:p-4 flex items-center gap-2 sm:gap-3 overflow-hidden">
                <a
                    href={`https://x.com/${user.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity"
                >
                    <img
                        src={user.avatar}
                        alt={`${user.name}'s avatar`}
                        className="w-8 h-8 md:w-10 md:h-10 sm:w-10 sm:h-10 rounded-full bg-slate-300 object-cover object-top shrink-0"
                    />
                    <div>
                        <span className="block mb-0.5 sm:mb-1 font-medium text-sm sm:text-base">{user.name}</span>
                        <span className="block text-xs text-slate-500">@{user.handle}</span>
                    </div>
                </a>
            </td>

            <td className="p-2 sm:p-4 font-medium">{user.points}</td>
        </motion.tr>
    );
};

export const Leaderboard = () => {
    const [users, setUsers] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/leaderboard');
                
                if (!response.ok) {
                    throw new Error('Failed to fetch leaderboard data');
                }
                
                const data = await response.json();
                setUsers(data);
                setError(null);
            } catch (err) {
                console.error("Error fetching leaderboard data:", err);
                setError("Failed to load leaderboard data");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="w-full p-8 text-center min-h-[200px] flex items-center justify-center">
                <BarLoader />
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full bg-white shadow-lg rounded-lg p-8 text-center text-red-500">
                <p>{error}</p>
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="w-full bg-white shadow-lg rounded-lg p-8 text-center">
                <p>No leaderboard data available</p>
            </div>
        );
    }

    return (
        <div className="p-2 sm:p-4 md:p-8 w-full">
            <div className="w-full bg-white shadow-lg rounded-lg max-w-4xl mx-auto">
                <PanelHeader title="Leaderboard" />
                <div className="overflow-x-auto overflow-y-auto max-h-[60vh] sm:max-h-[70vh]">
                    <table className="w-full relative">
                        <thead className="sticky top-0 z-7 bg-white">
                            <tr className="border-b-[1px] border-slate-200 text-slate-400 text-xs sm:text-sm uppercase">
                                <th className="text-start p-2 sm:p-4 font-medium">Rank</th>
                                <th className="text-start p-2 sm:p-4 font-medium">User</th>
                                <th className="text-start p-2 sm:p-4 font-medium">Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <TableRows key={user.id} user={user} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}; 