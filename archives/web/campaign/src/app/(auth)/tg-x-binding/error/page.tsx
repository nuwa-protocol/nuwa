'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const errorMessages: { [key: string]: string } = {
    missing_params: 'missing necessary parameters',
    invalid_state: 'invalid state parameter',
    state_expired: 'authorization state expired, please try again',
    token_error: 'failed to get Twitter token',
    user_info_error: 'failed to get user information',
    db_error: 'failed to perform database operation',
    server_error: 'server internal error',
    config_error: 'system configuration error, please contact the administrator',
};

function ErrorContent() {
    const searchParams = useSearchParams();
    const errorCode = searchParams.get('error') || 'server_error';
    const telegramId = searchParams.get('telegram_id');
    const errorMessage = errorMessages[errorCode] || errorMessages.server_error;

    useEffect(() => {
        // Send error message to Telegram
        if (telegramId) {
            const sendMessage = async () => {
                try {
                    await fetch('/api/bot/send-message', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            telegramId,
                            message: `Binding failed! ${errorMessage} Please return to Telegram and try again.`
                        }),
                    });
                } catch (error) {
                    console.error('Failed to send message to Telegram:', error);
                }
            };

            sendMessage();
        }

        // Close window after 5 seconds
        const timer = setTimeout(() => {
            window.close();
        }, 5000);

        return () => clearTimeout(timer);
    }, [telegramId, errorMessage]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white rounded-lg shadow-md max-w-md w-full text-center">
                <div className="mb-6">
                    <svg className="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">Binding failed</h1>
                <p className="text-gray-600 mb-6">
                    Error:{errorMessage}
                </p>
                <p className="text-gray-600 mb-6 font-bold">
                    Please return to Telegram and try again.
                </p>
            </div>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        }>
            <ErrorContent />
        </Suspense>
    );
} 