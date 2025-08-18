import React from 'react';
import Image from 'next/image';
import { AvatarProps } from './types';

export const Avatar: React.FC<AvatarProps> = ({ role }) => {
    if (role !== 'assistant') return null;

    return (
        <div className="size-10 flex items-left rounded-full justify-start shrink-0">
            <Image
                src="/nuwa.svg"
                alt="Nuwa Logo"
                width={30}
                height={30}
            />
        </div>
    );
}; 