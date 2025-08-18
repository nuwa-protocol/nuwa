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

        // If user is manually scrolling and it's not a forced scroll, do not auto scroll
        if (!force && isScrollingRef.current) return;

        // Check if already near bottom
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        // If near bottom or forced scroll, scroll to bottom
        if (isNearBottom || force) {
            // Use faster scroll behavior for streaming output
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
            // Handle scroll events
            const handleScroll = () => {
                isScrollingRef.current = true;
                if (scrollTimeoutRef.current) {
                    window.clearTimeout(scrollTimeoutRef.current);
                }
                scrollTimeoutRef.current = window.setTimeout(() => {
                    isScrollingRef.current = false;
                }, 150);
            };

            // Handle content changes
            const handleContentChange = () => {
                if (scrollTimeoutRef.current) {
                    window.clearTimeout(scrollTimeoutRef.current);
                }

                // Check if it's a streaming output change
                const isStreamingChange = Boolean(container.textContent?.includes('▋'));
                isStreamingRef.current = isStreamingChange;

                // Use shorter delay for streaming output
                const delay = isStreamingChange ? 10 : 50;

                scrollTimeoutRef.current = window.setTimeout(() => {
                    scrollToBottom(true);
                }, delay);
            };

            // Handle size changes (e.g., code block expansion)
            const handleResize = () => {
                const currentScrollHeight = container.scrollHeight;
                if (currentScrollHeight > lastScrollHeightRef.current) {
                    // Content height increased, might be an expansion
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
