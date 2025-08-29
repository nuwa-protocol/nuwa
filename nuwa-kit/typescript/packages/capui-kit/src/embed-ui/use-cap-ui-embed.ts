import { useState, useEffect, useRef, useCallback } from "react";
import { CapEmbedUIKit, type CapEmbedUIKitOptions } from "./cap-ui-embed.js";
import type { AIResponse, PromptOptions } from '../shared/parent-functions.js'

export interface UseCapEmbedUIKitProps extends CapEmbedUIKitOptions {
  autoAdjustHeight?: boolean
}

export interface UseCapEmbedUIKitReturn {
  capUI: CapEmbedUIKit | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  
  // Convenience methods
  sendPrompt: (prompt: string, options?: PromptOptions) => Promise<AIResponse>
  sendMessage: (type: string, payload: any) => Promise<void>
  getContext: (keys?: string[]) => Promise<any>
  setHeight: (height: string | number) => Promise<void>
  showLoading: (message?: string) => Promise<void>
  hideLoading: () => Promise<void>
  
  // Connection management
  connect: () => Promise<void>
  disconnect: () => void
  reconnect: () => Promise<void>
  
  // Auto height management
  containerRef: React.RefObject<HTMLDivElement>
  
  // Legacy methods (deprecated)
  setUIHeight: (height: number) => Promise<void>
}

/**
 * React hook for CapUI Embed UI Kit
 * Provides reactive state management for parent communication
 */
export function useCapEmbedUIKit(props: UseCapEmbedUIKitProps = {}): UseCapEmbedUIKitReturn {
  const { autoAdjustHeight = false, ...capUIOptions } = props
  
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const capUIRef = useRef<CapEmbedUIKit | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize CapEmbedUIKit
  useEffect(() => {
    const capUI = new CapEmbedUIKit({
      autoConnect: false, // We'll manage connection manually for better React integration
      ...capUIOptions
    })
    
    capUIRef.current = capUI
    
    // Auto-connect by default
    handleConnect()

    // Cleanup on unmount
    return () => {
      if (capUIRef.current) {
        capUIRef.current.disconnect()
      }
    }
  }, []) // Only run once on mount

  const handleConnect = async () => {
    if (!capUIRef.current || isConnecting) return
    
    setIsConnecting(true)
    setError(null)
    
    try {
      await capUIRef.current.connect()
      setIsConnected(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed'
      setError(errorMessage)
      setIsConnected(false)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = () => {
    if (capUIRef.current) {
      capUIRef.current.disconnect()
      setIsConnected(false)
      setError(null)
    }
  }

  const handleReconnect = async () => {
    if (!capUIRef.current) return
    
    setIsConnecting(true)
    setError(null)
    
    try {
      await capUIRef.current.reconnect()
      setIsConnected(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Reconnection failed'
      setError(errorMessage)
      setIsConnected(false)
    } finally {
      setIsConnecting(false)
    }
  }

  // Convenience methods that handle errors gracefully
  const sendPrompt = async (prompt: string, options?: PromptOptions): Promise<AIResponse> => {
    if (!capUIRef.current) {
      throw new Error('CapUI not initialized')
    }
    
    try {
      return await capUIRef.current.sendPrompt(prompt, options)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Send prompt failed'
      setError(errorMessage)
      throw err
    }
  }

  const sendMessage = async (type: string, payload: any): Promise<void> => {
    if (!capUIRef.current) {
      throw new Error('CapUI not initialized')
    }
    
    try {
      await capUIRef.current.sendMessage(type, payload)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Send message failed'
      setError(errorMessage)
      throw err
    }
  }

  const getContext = async (keys?: string[]): Promise<any> => {
    if (!capUIRef.current) {
      throw new Error('CapUI not initialized')
    }
    
    try {
      return await capUIRef.current.getContext(keys)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Get context failed'
      setError(errorMessage)
      throw err
    }
  }

  const setHeight = async (height: string | number): Promise<void> => {
    if (!capUIRef.current) {
      throw new Error('CapUI not initialized')
    }
    
    try {
      await capUIRef.current.setHeight(height)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Set height failed'
      setError(errorMessage)
      throw err
    }
  }

  const showLoading = async (message?: string): Promise<void> => {
    if (!capUIRef.current) {
      throw new Error('CapUI not initialized')
    }
    
    try {
      await capUIRef.current.showLoading(message)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Show loading failed'
      setError(errorMessage)
      throw err
    }
  }

  const hideLoading = async (): Promise<void> => {
    if (!capUIRef.current) {
      throw new Error('CapUI not initialized')
    }
    
    try {
      await capUIRef.current.hideLoading()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Hide loading failed'
      setError(errorMessage)
      throw err
    }
  }

  // Legacy method for backward compatibility
  const setUIHeight = useCallback(async (height: number): Promise<void> => {
    await setHeight(height)
  }, [setHeight])

  // Auto adjust height functionality
  useEffect(() => {
    if (!autoAdjustHeight || !capUIRef.current || !containerRef.current || !isConnected) return

    const updateHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.scrollHeight
        setHeight(height).catch(err => {
          console.warn('Failed to auto-adjust height:', err)
        })
      }
    }

    // Create a MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(updateHeight)
    })

    // Watch for changes in the container and its children
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    // Also listen for window resize
    window.addEventListener('resize', updateHeight)

    // Initial height update
    updateHeight()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [autoAdjustHeight, isConnected, setHeight])

  return {
    capUI: capUIRef.current,
    isConnected,
    isConnecting,
    error,
    
    // Convenience methods
    sendPrompt,
    sendMessage,
    getContext,
    setHeight,
    showLoading,
    hideLoading,
    
    // Connection management
    connect: handleConnect,
    disconnect: handleDisconnect,
    reconnect: handleReconnect,
    
    // Auto height management
    containerRef,
    
    // Legacy methods (deprecated)
    setUIHeight
  }
}
