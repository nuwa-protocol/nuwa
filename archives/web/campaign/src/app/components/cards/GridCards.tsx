import React from "react";
import { useMissions } from "@/app/context/MissionsContext";
// 移除直接从airtable.ts导入Mission类型
// Remove direct import of Mission type from airtable.ts

// 定义Mission类型
// Define Mission type
interface Mission {
    id: string;
    title: string;
    description: string;
    suggestionText: string;
    suggested?: boolean;
    prompt?: string;
    order?: number;
}

// Standard image URL
const UNIFIED_IMAGE_URL = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2264&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

interface GridCardsProps {
    onSelectSuggestion: (suggestion: string) => void;
    onCloseGridCards: () => void;
}

export const GridCards = ({ onSelectSuggestion, onCloseGridCards }: GridCardsProps) => {
    const { missions, loading, error } = useMissions();

    if (loading) {
        return <div className="p-4 text-center">Loading missions...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-red-500">Failed to load missions</div>;
    }

    return (
        <div className="p-4 text-slate-800 md:p-12">
            <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-4 ">
                <TitleCard />
                {missions.map((mission) => (
                    <Card
                        key={mission.id}
                        mission={mission}
                        onSelectSuggestion={onSelectSuggestion}
                        onCloseGridCards={onCloseGridCards}
                    />
                ))}
            </div>
        </div>
    );
};

interface CardProps {
    mission: Mission;
    onSelectSuggestion: (suggestion: string) => void;
    onCloseGridCards: () => void;
}

const Card = ({ mission, onSelectSuggestion, onCloseGridCards }: CardProps) => {

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        console.log("Card clicked:", mission.title, mission.suggestionText);
        onSelectSuggestion(mission.suggestionText);
        onCloseGridCards(); // 关闭网格视图
    };

    return (
        <a
            href="#"
            onClick={handleClick}
            className="group relative flex h-56 flex-col justify-end overflow-hidden p-6 transition-colors hover:bg-slate-100 md:h-80 md:p-9 border border-slate-300"
        >
            <h2 className="relative z-10 text-3xl leading-tight text-slate-800 transition-transform duration-500 group-hover:-translate-y-3">
                {mission.title}
            </h2>
            <p className="relative z-10 text-sm text-slate-400 mt-2 line-clamp-2">
                {mission.description}
            </p>

            <div
                className="absolute bottom-0 left-0 right-0 top-0 opacity-0 blur-sm grayscale transition-all group-hover:opacity-10 group-active:scale-105 group-active:opacity-30 group-active:blur-0 group-active:grayscale-0"
                style={{
                    backgroundImage: `url(${UNIFIED_IMAGE_URL})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            />

            <Corners />
        </a>
    );
};

const Corners = () => (
    <>
        <span className="absolute left-[1px] top-[1px] z-10 h-3 w-[1px] origin-top scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute left-[1px] top-[1px] z-10 h-[1px] w-3 origin-left scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute bottom-[1px] right-[1px] z-10 h-3 w-[1px] origin-bottom scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute bottom-[1px] right-[1px] z-10 h-[1px] w-3 origin-right scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute bottom-[1px] left-[1px] z-10 h-3 w-[1px] origin-bottom scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute bottom-[1px] left-[1px] z-10 h-[1px] w-3 origin-left scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute right-[1px] top-[1px] z-10 h-3 w-[1px] origin-top scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
        <span className="absolute right-[1px] top-[1px] z-10 h-[1px] w-3 origin-right scale-0 bg-slate-800 transition-all duration-500 group-hover:scale-100" />
    </>
);

const TitleCard = () => {
    return (
        <div className="group relative flex h-56 flex-col justify-between bg-slate-100 p-6 md:h-80 md:p-9 border border-slate-300">
            <h2 className="text-4xl uppercase leading-tight text-slate-800">
                <span className="text-slate-600 transition-colors duration-500 group-hover:text-slate-800">
                    Explore more
                </span>
                <br />
                Missions
            </h2>
        </div>
    );
}; 