'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

function SuccessContent() {
    const searchParams = useSearchParams();
    const telegramId = searchParams.get('telegram_id');
    const twitterHandle = searchParams.get('twitter_handle');
    const twitterName = searchParams.get('twitter_name');
    const twitterAvatarUrl = searchParams.get('twitter_avatar_url');

    useEffect(() => {
        // Send success message to Telegram
        if (telegramId && twitterHandle) {
            const sendMessage = async () => {
                try {
                    await fetch('/api/bot/send-welcome', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            telegramId,
                            twitterHandle
                        }),
                    });
                } catch (error) {
                    console.error('Failed to send welcome message to Telegram:', error);
                }
            };

            sendMessage();
        }
    }, [telegramId, twitterHandle]);

    const handleBackToTelegram = () => {
        const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'your_bot_username';
        // 使用 deeplink 格式
        const deeplinkUrl = `tg://resolve?domain=${botUsername}`;

        // 尝试打开 Telegram 应用
        window.location.href = deeplinkUrl;

        // 如果 deeplink 失败，回退到普通链接
        setTimeout(() => {
            window.location.href = `https://t.me/${botUsername}`;
        }, 5000);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <div className="p-8 bg-white rounded-lg shadow-md max-w-md w-full text-center">
                <div className="mb-6">
                    <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">Binding Successful</h1>

                {twitterAvatarUrl && (
                    <div className="mb-4 flex justify-center">
                        <div className="relative w-20 h-20 rounded-full overflow-hidden">
                            <Image
                                src={twitterAvatarUrl}
                                alt={`${twitterName || twitterHandle}'s avatar`}
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>
                )}

                <div className="mb-4">
                    <p className="text-lg font-semibold text-gray-800">
                        {twitterName || 'Twitter User'}
                    </p>
                    <p className="text-blue-500">@{twitterHandle}</p>
                </div>

                <p className="text-gray-600 mb-6">
                    Your Twitter account has been successfully bound!
                    <br />
                    <span className="font-bold">Please return to Telegram to continue.</span>

                </p>

                <button
                    onClick={handleBackToTelegram}
                    className="inline-block px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors mb-4"
                >
                    Back to Telegram
                </button>

                <div className="text-xs text-gray-500">
                    Telegram ID: {telegramId}
                </div>
            </div>
        </div>
    );
}

export default function AuthSuccessPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}
