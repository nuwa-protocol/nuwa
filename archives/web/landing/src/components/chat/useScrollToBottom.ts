import { useEffect, useRef, type RefObject, useCallback } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
    RefObject<T | null>,
    RefObject<T | null>,
] {
    const containerRef = useRef<T | null>(null);
    const endRef = useRef<T | null>(null);
    const scrollTimeoutRef = useRef<number | null>(null);
    const isScrollingRef = useRef(false);
    const lastScrollHeightRef = useRef<number>(0);
    const isStreamingRef = useRef(false);

    const scrollToBottom = useCallback((force = false) => {
        if (!endRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const end = endRef.current;

        // 如果用户正在手动滚动，且不是强制滚动，则不自动滚动
        if (!force && isScrollingRef.current) return;

        // 检查是否已经接近底部
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        // 如果接近底部或是强制滚动，则滚动到底部
        if (isNearBottom || force) {
            // 在流式输出时使用更快的滚动行为
            end.scrollIntoView({
                behavior: isStreamingRef.current ? 'auto' : 'smooth',
                block: 'end'
            });
        }
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        const end = endRef.current;

        if (container && end) {
            // 处理滚动事件
            const handleScroll = () => {
                isScrollingRef.current = true;
                if (scrollTimeoutRef.current) {
                    window.clearTimeout(scrollTimeoutRef.current);
                }
                scrollTimeoutRef.current = window.setTimeout(() => {
                    isScrollingRef.current = false;
                }, 150);
            };

            // 处理内容变化
            const handleContentChange = () => {
                if (scrollTimeoutRef.current) {
                    window.clearTimeout(scrollTimeoutRef.current);
                }

                // 检测是否是流式输出的变化
                const isStreamingChange = Boolean(container.textContent?.includes('▋'));
                isStreamingRef.current = isStreamingChange;

                // 在流式输出时使用更短的延迟
                const delay = isStreamingChange ? 10 : 50;

                scrollTimeoutRef.current = window.setTimeout(() => {
                    scrollToBottom(true);
                }, delay);
            };

            // 处理大小变化（比如代码块展开）
            const handleResize = () => {
                const currentScrollHeight = container.scrollHeight;
                if (currentScrollHeight > lastScrollHeightRef.current) {
                    // 内容高度增加，可能是展开操作
                    scrollToBottom(true);
                }
                lastScrollHeightRef.current = currentScrollHeight;
            };

            const observer = new MutationObserver(handleContentChange);
            const resizeObserver = new ResizeObserver(handleResize);

            observer.observe(container, {
                childList: true,
                subtree: true,
                characterData: true,
            });

            resizeObserver.observe(container);

            container.addEventListener('scroll', handleScroll);

            return () => {
                observer.disconnect();
                resizeObserver.disconnect();
                container.removeEventListener('scroll', handleScroll);
                if (scrollTimeoutRef.current) {
                    window.clearTimeout(scrollTimeoutRef.current);
                }
            };
        }
    }, [scrollToBottom]);

    return [containerRef, endRef];
}
