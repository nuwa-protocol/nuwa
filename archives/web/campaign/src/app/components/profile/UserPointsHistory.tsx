'use client'

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiAward, FiRefreshCw } from "react-icons/fi";
import { PointsHistoryItem } from "@/app/services/supabaseService";
import { BarLoader } from "@/app/components/shared/BarLoader";
import { useMissions } from "@/app/context/MissionsContext";
import { PanelHeader } from "@/app/components/shared/PanelHeader";

interface UserPointsHistoryProps {
    userName: string;
}

export const UserPointsHistory = ({ userName }: UserPointsHistoryProps) => {
    const [history, setHistory] = useState<PointsHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { missions } = useMissions();

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/user/history');
            
            if (response.status === 401) {
                // 用户未登录
                setHistory([]);
                setError('You need to be logged in to view history');
                return;
            }
            
            if (!response.ok) {
                throw new Error('Failed to fetch points history');
            }
            
            const historyData = await response.json();
            setHistory(historyData);
            setError(null);
        } catch (err) {
            console.error('Error fetching points history:', err);
            setError('Failed to load points history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [userName]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchHistory();
        setTimeout(() => {
            setIsRefreshing(false);
        }, 500);
    };

    // 根据任务ID获取任务标题
    const getMissionTitle = (missionId: string) => {
        const mission = missions.find(m => m.id === missionId);
        return mission ? mission.title : 'Unknown Mission';
    };

    if (loading && !isRefreshing) {
        return <div className="w-full p-8 text-center min-h-[200px] flex items-center justify-center">
            <BarLoader />
        </div>;
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="text-red-500 mb-4">{error}</div>
                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="p-8">
                <div className="text-gray-500 mb-4">No points history available</div>
                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                    Refresh
                </button>
            </div>
        );
    }

    return (
        <div className="w-full bg-white shadow-lg rounded-lg">
            <PanelHeader
                title="Points History"
                rightElement={
                    <button
                        onClick={handleRefresh}
                        className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                        title="Refresh data"
                    >
                        <FiRefreshCw className="w-5 h-5" />
                    </button>
                }
            />
            <div className="max-h-[500px] overflow-auto">
                <table className="w-full relative">
                    <thead className="sticky top-0 bg-white z-7">
                        <tr className="border-b-[1px] border-slate-200 text-slate-400 text-sm uppercase">
                            <th className="pl-2 sm:pl-4 w-8"></th>
                            <th className="text-start p-2 sm:p-4 font-medium">Mission</th>
                            <th className="text-start p-2 sm:p-4 font-medium">Points</th>
                            <th className="text-start p-2 sm:p-4 font-medium hidden sm:table-cell">Date</th>
                        </tr>
                    </thead>

                    <tbody>
                        {history.map((item, index) => (
                            <TableRow
                                key={item.id}
                                item={item}
                                index={index}
                                getMissionTitle={getMissionTitle}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TableRow = ({
    item,
    index,
    getMissionTitle,
}: {
    item: PointsHistoryItem;
    index: number;
    getMissionTitle: (missionId: string) => string;
}) => {
    // 使用原生JavaScript格式化日期
    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const day = date.getDate();
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${month} ${day}, ${year} ${hours}:${minutes}`;
        } catch {
            return 'Unknown date';
        }
    };

    const formattedDate = item.createdTime ? formatDate(item.createdTime) : 'Unknown date';
    const missionTitle = getMissionTitle(item.missionId);

    return (
        <motion.tr
            layoutId={`row-${item.id}`}
            className={`text-sm ${index % 2 ? "bg-slate-100" : "bg-white"}`}
        >
            <td className="pl-2 sm:pl-4 w-8 text-lg">

            </td>

            <td className="p-2 sm:p-4">
                <div>
                    <span className="block mb-1 font-medium">{missionTitle}</span>
                    <span className="block text-xs text-slate-500">{item.missionDetails}</span>
                    <span className="block text-xs text-slate-500 sm:hidden mt-1">{formattedDate}</span>
                </div>
            </td>

            <td className="p-2 sm:p-4">
                <div className={`flex items-center gap-2 font-medium ${item.points > 0 ? "text-green-500" : "text-red-500"
                    }`}>
                    <span>{item.points > 0 ? `+${item.points}` : item.points}</span>
                    {item.points > 0 && <FiAward className="text-xl" />}
                </div>
            </td>

            <td className="p-2 sm:p-4 font-medium text-slate-600 hidden sm:table-cell">{formattedDate}</td>
        </motion.tr>
    );
}; 