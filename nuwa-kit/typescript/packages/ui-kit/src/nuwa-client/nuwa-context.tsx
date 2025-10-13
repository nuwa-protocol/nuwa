import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { NuwaClient, type NuwaClientOptions, type NuwaThemeValue } from "./nuwa-client.js";

interface NuwaContextValue {
  nuwaClient: NuwaClient;
  theme: NuwaThemeValue;
  connected: boolean;
}

const NuwaClientContext = React.createContext<NuwaContextValue | null>(null);

export interface NuwaProviderProps extends NuwaClientOptions {
  children: React.ReactNode;
  // Automatically adjust the parent iframe height to fit content
  autoHeight?: boolean;
  // Callbacks
  onConnected?: () => void;
  onError?: (error: Error) => void;
  // Optional wrapper props
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Provider that sets up a NuwaClient connection and exposes it via context.
 * Also wraps children with a container that can auto-adjust the iframe height.
 */
export function NuwaProvider(props: NuwaProviderProps) {
  const {
    children,
    autoHeight = true,
    onConnected,
    onError,
    className,
    style,
    ...clientOptions
  } = props;

  // Stable client instance
  const clientRef = useRef<NuwaClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new NuwaClient({ ...clientOptions });
  }
  const nuwaClient = clientRef.current as NuwaClient;

  // Theme state sourced from nuwaClient
  const [theme, setTheme] = useState<NuwaThemeValue>(() => nuwaClient.theme);
  const [connected, setConnected] = useState(false);

  // Attach theme subscription once
  useEffect(() => {
    return nuwaClient.onThemeChange((t) => setTheme(t));
  }, [nuwaClient]);

  // Connect on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: it's ok
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await nuwaClient.connect();
        if (cancelled) return;
        setConnected(true);
        // Ensure any synchronous theme the parent may have already pushed is surfaced
        setTheme(nuwaClient.theme);
        onConnected?.();
        // Trigger an initial height update on next frame if needed
        if (autoHeight) requestAnimationFrame(updateHeight);
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    })();

    return () => {
      cancelled = true;
      try {
        nuwaClient.disconnect();
      } catch {
        // no-op
      }
      setConnected(false);
    };
  }, []);

  // Container for auto height
  const containerRef = useRef<HTMLDivElement>(null);

  const updateHeight = () => {
    if (!autoHeight || !containerRef.current) return;
    const h = containerRef.current.scrollHeight;
    // Fire and forget; NuwaClient has its own error handling
    nuwaClient.setHeight(h).catch(() => { });
  };

  // Observe DOM changes to update height
  // biome-ignore lint/correctness/useExhaustiveDependencies: it's ok
  useEffect(() => {
    if (!autoHeight || !containerRef.current) return;
    const obs = new MutationObserver(() => requestAnimationFrame(updateHeight));
    obs.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", updateHeight);
    // Ensure initial sizing (e.g., for loading screen)
    requestAnimationFrame(updateHeight);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [autoHeight]);

  const ctx: NuwaContextValue = useMemo(
    () => ({ nuwaClient, theme, connected }),
    [nuwaClient, theme, connected],
  );

  return (
    <NuwaClientContext.Provider value={ctx}>
      <div ref={containerRef} className={`${theme === 'dark' ? 'dark' : ''} ${className}`} style={style}>
        {children}
      </div>
    </NuwaClientContext.Provider>
  );
}

/** Get the NuwaClient instance from context. */
export function useNuwa() {
  const ctx = useContext(NuwaClientContext);
  if (!ctx) throw new Error("useNuwa must be used within NuwaProvider");
  return {
    nuwa: ctx.nuwaClient,
    theme: ctx.theme,
    connected: ctx.connected,
  };
}
