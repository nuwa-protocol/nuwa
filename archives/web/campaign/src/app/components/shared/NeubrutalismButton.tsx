import React from "react";

interface NeubrutalismButtonProps {
    text: string;
    onClick?: () => void;
}

const NeubrutalismButton = ({ text, onClick }: NeubrutalismButtonProps) => {
    return (
        <div className="bg-whiteflex items-center justify-center">
            <button
                onClick={onClick}
                className="px-4 py-1.5 md:px-6 md:py-2 text-sm md:text-base font-medium bg-indigo-500 text-white w-fit transition-all shadow-[3px_3px_0px_black] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] rounded-full"
            >
                {text}
            </button>
        </div>
    );
};

export default NeubrutalismButton;