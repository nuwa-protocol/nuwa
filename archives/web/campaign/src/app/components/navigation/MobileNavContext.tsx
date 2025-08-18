'use client'

import React, { createContext, useContext, useState } from 'react';

interface MobileNavContextType {
    active: boolean;
    setActive: React.Dispatch<React.SetStateAction<boolean>>;
}

export const MobileNavContext = createContext<MobileNavContextType>({
    active: false,
    setActive: () => { },
});

export const MobileNavProvider = ({ children }: { children: React.ReactNode }) => {
    const [active, setActive] = useState(false);

    return (
        <MobileNavContext.Provider value={{ active, setActive }}>
            {children}
        </MobileNavContext.Provider>
    );
}; 