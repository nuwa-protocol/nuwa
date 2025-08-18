'use client';

import { useEffect, useState } from 'react';
import { IoClose } from 'react-icons/io5';

export const PWAInstallPrompt = () => {
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if device is iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Check if already installed
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isInStandaloneMode = (window.navigator as any).standalone || isStandalone;

        if (isIOSDevice && !isInStandaloneMode) {
            setShowPrompt(true);
        }
    }, []);

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 shadow-lg z-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <p className="text-sm text-gray-700">
                        {isIOS ? (
                            <>
                                Tap the <span className="font-medium">Share</span> button, then select{' '}
                                <span className="font-medium">"Add to Home Screen"</span> to install the app
                            </>
                        ) : (
                            'Add this app to your home screen for a better experience'
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setShowPrompt(false)}
                    className="ml-4 p-1 hover:bg-gray-100 rounded-full"
                >
                    <IoClose className="w-5 h-5 text-gray-500" />
                </button>
            </div>
        </div>
    );
}; 