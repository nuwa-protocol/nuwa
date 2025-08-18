'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface GridCardsContextType {
    showGridCards: boolean;
    setShowGridCards: React.Dispatch<React.SetStateAction<boolean>>;
}

const GridCardsContext = createContext<GridCardsContextType>({
    showGridCards: false,
    setShowGridCards: () => { },
});

export const useGridCards = () => useContext(GridCardsContext);

export const GridCardsProvider = ({ children }: { children: ReactNode }) => {
    const [showGridCards, setShowGridCards] = useState(false);

    return (
        <GridCardsContext.Provider value={{ showGridCards, setShowGridCards }}>
            {children}
        </GridCardsContext.Provider>
    );
}; 