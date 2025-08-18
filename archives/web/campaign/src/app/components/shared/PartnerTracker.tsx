"use client"
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function PartnerTracker() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const partner = searchParams.get("partner");
        if (partner) {
            localStorage.setItem("partner", partner);
        }
    }, [searchParams]);

    return null;
} 