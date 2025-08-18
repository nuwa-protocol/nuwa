import React, { ReactNode } from 'react';

interface PanelHeaderProps {
    title: string;
    className?: string;
    rightElement?: ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, className = '', rightElement }) => {
    return (
        <div className={`flex justify-between items-center p-4 border-b border-slate-200 ${className}`}>
            <h3 className="text-lg md:text-xl font-medium bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                {title}
            </h3>
            {rightElement}
        </div>
    );
}; 