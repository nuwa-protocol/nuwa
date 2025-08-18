'use client'

import { useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import NeubrutalismButton from '@/app/components/shared/NeubrutalismButton';

interface TwitterCardProps {
    content: string;
    imageUrl?: string;
}

export function TwitterCard({ content, imageUrl }: TwitterCardProps) {
    const { data: session } = useSession();

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 max-w-[550px]">
            <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                    <Image
                        src={session?.user?.image || '/default-avatar.png'}
                        alt="Profile"
                        width={48}
                        height={48}
                        className="rounded-full"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1">
                        <span className="font-bold text-gray-900 dark:text-white">
                            {session?.user?.name || 'Anonymous'}
                        </span>
                        {session?.user?.twitterHandle && (
                            <span className="text-gray-500">
                                @{session.user.twitterHandle}
                            </span>
                        )}
                    </div>
                    <p className="text-gray-900 dark:text-white mt-1">{content}</p>
                    {imageUrl && (
                        <div className="mt-3 overflow-hidden">
                            <Image
                                src={imageUrl}
                                alt="Tweet image"
                                width={400}
                                height={400}
                                className="w-[400px] h-[400px] object-cover rounded-xl"
                            />
                        </div>
                    )}
                    <div className="mt-4">
                        <NeubrutalismButton
                            text={'Post on Twitter'}
                            onClick={() => {
                                const tweetText = encodeURIComponent(content);
                                window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
} 