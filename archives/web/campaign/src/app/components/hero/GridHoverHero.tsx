'use client'

import React, { useEffect, useState } from "react";
import { useAnimate } from "framer-motion";
import { signIn } from "next-auth/react";
import { FaXTwitter } from "react-icons/fa6";
import Image from "next/image";

interface GridHoverHeroProps {
    onJoinClick?: () => void;
}

export const GridHoverHero = ({ onJoinClick }: GridHoverHeroProps) => {
    const [scope, animate] = useAnimate();

    const [size, setSize] = useState({ columns: 0, rows: 0 });

    useEffect(() => {
        generateGridCount();
        window.addEventListener("resize", generateGridCount);

        return () => window.removeEventListener("resize", generateGridCount);
    }, []);

    const generateGridCount = () => {
        const columns = Math.floor(document.body.clientWidth / 75);
        const rows = Math.floor(document.body.clientHeight / 75);

        setSize({
            columns,
            rows,
        });
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        // @ts-ignore
        const id = `#${e.target.id}`;
        animate(id, { background: "rgba(129, 140, 248, 0)" }, { duration: 1.5 });
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
        // @ts-ignore
        const id = `#${e.target.id}`;
        animate(id, { background: "rgba(129, 140, 248, 1)" }, { duration: 0.15 });
    };

    const handleTwitterLogin = () => {
        // 调用Twitter登录
        signIn("twitter", { callbackUrl: "/" });

        // 如果提供了onJoinClick回调，也执行它
        if (onJoinClick) {
            onJoinClick();
        }
    };

    return (
        <div className="bg-neutral-950">
            <div
                ref={scope}
                className="grid h-screen w-full grid-cols-[repeat(auto-fit,_minmax(75px,_1fr))] grid-rows-[repeat(auto-fit,_minmax(75px,_1fr))]"
            >
                {[...Array(size.rows * size.columns)].map((_, i) => (
                    <div
                        key={i}
                        id={`square-${i}`}
                        onMouseLeave={handleMouseLeave}
                        onMouseEnter={handleMouseEnter}
                        className="h-full w-full border-[1px] border-neutral-900"
                    />
                ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-8">
                <Image
                    src="/nuwa.svg"
                    alt="Nuwa Logo"
                    width={128}
                    height={128}
                    className="mb-8 h-24 w-auto md:h-32"
                    priority
                />
                <h1 className="text-center text-6xl font-black uppercase text-white sm:text-8xl md:text-9xl">
                    Join the Nuwa Campaign
                </h1>
                <p className="mb-6 mt-4 max-w-3xl text-center text-lg font-light text-neutral-500 md:text-xl">
                    Interact with AI Agents Effortlessly — Earn Points, Collect NFTs, and Unlock Crypto Airdrops in the Web3 Intelligence Era.
                </p>
                <button
                    onClick={handleTwitterLogin}
                    className="pointer-events-auto bg-indigo-400 px-4 py-2 text-xl font-bold uppercase text-neutral-950 mix-blend-difference"
                >
                    <div className="flex items-center">
                        <span>Login with</span>
                        <FaXTwitter className="mx-2" />
                    </div>
                </button>
            </div>
        </div>
    );
}; 