import React, { useRef, useState, useEffect } from "react";
import {
    motion,
    useMotionTemplate,
    useMotionValue,
    useSpring,
    useTransform,
} from "framer-motion";

const ROTATION_RANGE = 35;
const HALF_ROTATION_RANGE = ROTATION_RANGE / 2;
const PERSPECTIVE = "1500px";

interface TiltImageCardProps {
    src: string;
    alt?: string;
    onError?: () => void;
}

export const TiltImageCard: React.FC<TiltImageCardProps> = ({ src, alt, onError }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const xSpring = useSpring(x);
    const ySpring = useSpring(y);

    const transform = useMotionTemplate`rotateX(${xSpring}deg) rotateY(${ySpring}deg)`;

    const sheenOpacity = useTransform(
        ySpring,
        [-HALF_ROTATION_RANGE, 0, HALF_ROTATION_RANGE],
        [0.5, 0, 0.5]
    );

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();

        const width = rect.width;
        const height = rect.height;

        const mouseX = (e.clientX - rect.left) * ROTATION_RANGE;
        const mouseY = (e.clientY - rect.top) * ROTATION_RANGE;

        const rX = (mouseY / height - HALF_ROTATION_RANGE) * -1;
        const rY = mouseX / width - HALF_ROTATION_RANGE;

        x.set(rX);
        y.set(rY);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
        setImageDimensions({
            width: img.naturalWidth,
            height: img.naturalHeight
        });
        setImageLoaded(true);
    };

    // 计算最大宽度和高度，保持图片比例
    const maxWidth = 500; // 最大宽度
    const maxHeight = 400; // 最大高度

    let width = maxWidth;
    let height = maxHeight;

    if (imageLoaded && imageDimensions.width > 0 && imageDimensions.height > 0) {
        const aspectRatio = imageDimensions.width / imageDimensions.height;

        if (aspectRatio > 1) {
            // 横向图片
            width = maxWidth;
            height = maxWidth / aspectRatio;
            if (height > maxHeight) {
                height = maxHeight;
                width = maxHeight * aspectRatio;
            }
        } else {
            // 纵向图片
            height = maxHeight;
            width = maxHeight * aspectRatio;
            if (width > maxWidth) {
                width = maxWidth;
                height = maxWidth / aspectRatio;
            }
        }
    }

    return (
        <span
            className="inline-block relative w-full grid place-content-center overflow-visible"
            style={{ perspective: PERSPECTIVE }}
        >
            <motion.span
                ref={ref}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                    transform,
                    width: `${width}px`,
                    height: `${height}px`,
                }}
                className="inline-block relative overflow-hidden shadow-lg shadow-zinc-500 rounded-lg"
            >
                <img
                    src={src}
                    alt={alt || ''}
                    className="w-full h-full object-contain"
                    onError={onError}
                    onLoad={handleImageLoad}
                />
                <motion.span
                    style={{ opacity: sheenOpacity }}
                    className="absolute inset-0 bg-gradient-to-br from-zinc-300/50 via-zinc-300 to-zinc-300/50"
                />
            </motion.span>
        </span>
    );
}; 