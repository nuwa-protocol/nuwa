'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface MessagesContextType {
    hasMessages: boolean;
    setHasMessages: React.Dispatch<React.SetStateAction<boolean>>;
}

const MessagesContext = createContext<MessagesContextType>({
    hasMessages: false,
    setHasMessages: () => { },
});

export const useMessages = () => useContext(MessagesContext);

export const MessagesProvider = ({ children }: { children: ReactNode }) => {
    const [hasMessages, setHasMessages] = useState(false);

    return (
        <MessagesContext.Provider value={{ hasMessages, setHasMessages }}>
            {children}
        </MessagesContext.Provider>
    );
}; 