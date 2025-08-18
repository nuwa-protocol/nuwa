'use client'

import { SessionProvider } from "next-auth/react";
import { MissionsProvider } from "../../context/MissionsContext";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <MissionsProvider>
                {children}
            </MissionsProvider>
        </SessionProvider>
    );
} 