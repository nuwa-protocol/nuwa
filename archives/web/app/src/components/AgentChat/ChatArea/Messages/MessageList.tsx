import { ChatMessage } from "./ChatMessage";
import { Message } from "@/types/message";
import useChannelMessageCount from "@/hooks/useChannelMessageCount";
import useChannelMessages from "@/hooks/useChannelMessages";
import { useAgentChat } from "@/contexts/AgentChatContext";
import { RoochAddress } from "@roochnetwork/rooch-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Props for the MessageList component
 */
interface MessageListProps {
  /** Channel ID */
  channelId: string;
  /** Name of the current agent */
  agentName?: string;
  /** ID of the current agent */
  agentId?: string;
  /** Address of the agent for identifying AI messages */
  agentAddress?: string;
  /** Callback for AI thinking state changes */
  onAIThinkingChange?: (isThinking: boolean) => void;
}

const MESSAGES_PER_PAGE = 50;

/**
 * MessageList component - Displays the list of chat messages
 * Features:
 * - Auto-scrolling to latest messages
 * - Different styles for user and AI messages
 * - Message timestamps and sender information
 * - Internal user/AI message detection
 * - Integrated message fetching
 * - Infinite scroll loading
 */
export function MessageList({
  channelId,
  agentName,
  agentId,
  agentAddress,
  onAIThinkingChange,
}: MessageListProps) {
  const { currentAddress } = useAgentChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Message state management
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [reachedTop, setReachedTop] = useState(false);
  const [isLoadingMoreUp, setIsLoadingMoreUp] = useState(false);
  const [lastScrollHeight, setLastScrollHeight] = useState(0);
  const [autoRefreshTrigger, setAutoRefreshTrigger] = useState(0);
  const [currentQueryPage, setCurrentQueryPage] = useState<number | null>(null);

  // Ensure valid channel ID
  const validChannelId =
    channelId && channelId.length > 0 ? channelId : undefined;

  // Get total message count
  const { messageCount } = useChannelMessageCount(validChannelId);

  // Calculate latest page - correct calculation method
  const latestPage =
    messageCount <= 0 ? 0 : Math.floor((messageCount - 1) / MESSAGES_PER_PAGE);

  // Use custom hook to get messages for specific page
  const {
    messages: pageMessages,
    isPending: isMessagesLoading,
    refetch: refetchMessages,
    isError,
  } = useChannelMessages({
    channelId: validChannelId,
    page: currentQueryPage !== null ? currentQueryPage : latestPage,
    size: MESSAGES_PER_PAGE,
  });

  // Optimization 1: Add a debounce function to control loading frequency
  const debounce = useCallback((fn: Function, ms = 300) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return function (this: any, ...args: any[]) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), ms);
    };
  }, []);

  // Optimization 2: Use a smarter loading trigger function
  const triggerPageLoad = useCallback(
    (page: number) => {
      // If page is already loaded or currently loading, don't trigger again
      if (loadedPages.includes(page) || currentQueryPage === page) {
        return false;
      }
      setCurrentQueryPage(page);
      return true;
    },
    [loadedPages, currentQueryPage],
  );

  // Optimization 3: More efficiently detect pages that need loading
  const loadLatestMessages = useCallback(() => {
    if (!validChannelId) return;

    if (messageCount <= 0) {
      // If no messages and page 0 hasn't been loaded, try loading it
      if (!loadedPages.includes(0) && currentQueryPage !== 0) {
        triggerPageLoad(0);
      }
      return;
    }

    // Has messages, calculate and load latest page
    if (currentQueryPage === null) {
      triggerPageLoad(latestPage);

      // Add: Check if earlier pages should be loaded
      setTimeout(() => {
        // If there are multiple pages, ensure complete history is loaded
        if (latestPage > 0 && allMessages.length < Math.min(messageCount, 20)) {
          // Load pages from previous to latest, going backwards
          for (
            let page = latestPage - 1;
            page >= Math.max(0, latestPage - 3);
            page--
          ) {
            if (!loadedPages.includes(page)) {
              setTimeout(
                () => triggerPageLoad(page),
                (latestPage - page) * 200,
              );
            }
          }
        }
      }, 1000); // Wait 1 second to ensure latest page is loaded
    }
  }, [
    validChannelId,
    messageCount,
    loadedPages,
    currentQueryPage,
    latestPage,
    triggerPageLoad,
    allMessages.length,
  ]);

  // Optimization 4: Replace auto-loading effect, remove setTimeout
  useEffect(() => {
    if (validChannelId && autoRefreshTrigger > 0 && currentQueryPage === null) {
      loadLatestMessages();
    }
  }, [
    validChannelId,
    autoRefreshTrigger,
    currentQueryPage,
    loadLatestMessages,
  ]);

  // Optimization 5: More effective error handling and retry
  useEffect(() => {
    if (isError && validChannelId) {
      // Use debounce for error retry to avoid frequent triggers
      const retryTimer = setTimeout(() => {
        if (currentQueryPage !== null) {
          // Reset page query to trigger new request
          setCurrentQueryPage(null);
          setTimeout(() => triggerPageLoad(currentQueryPage), 100);
        } else if (messageCount > 0) {
          triggerPageLoad(latestPage);
        }
      }, 1000);

      return () => clearTimeout(retryTimer);
    }
  }, [
    isError,
    validChannelId,
    currentQueryPage,
    messageCount,
    latestPage,
    triggerPageLoad,
  ]);

  // Optimization 6: Improve new message detection and loading logic
  useEffect(() => {
    // First load doesn't count
    if (lastMessageCount === 0) {
      setLastMessageCount(messageCount);
      return;
    }

    // Detect new messages
    if (messageCount > lastMessageCount) {
      const newCount = messageCount - lastMessageCount;

      // When user is not at bottom, only update counter
      if (!isAtBottom) {
        setNewMessageCount((prev) => prev + newCount);

        // Only trigger page load when new messages might be on new page
        const newLatestPage = Math.floor(
          (messageCount - 1) / MESSAGES_PER_PAGE,
        );
        if (newLatestPage > Math.max(...loadedPages, 0)) {
          triggerPageLoad(newLatestPage);
        } else {
          // Otherwise just refresh current page
          refetchMessages();
        }
      } else {
        // User is at bottom, directly load latest messages and maintain scroll
        // Check if new page needs to be loaded
        const newLatestPage = Math.floor(
          (messageCount - 1) / MESSAGES_PER_PAGE,
        );
        if (newLatestPage > Math.max(...loadedPages, 0)) {
          triggerPageLoad(newLatestPage);
        } else {
          refetchMessages();
        }
      }
    }

    setLastMessageCount(messageCount);
  }, [
    messageCount,
    isAtBottom,
    lastMessageCount,
    loadedPages,
    refetchMessages,
    triggerPageLoad,
  ]);

  // Optimization 7: Improve scroll loading history messages logic
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Use debounce for scroll events to avoid too frequent checks
    const debouncedScrollHandler = debounce(() => {
      // Check if near bottom
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;

      setIsAtBottom(isNearBottom);
      setShowScrollToBottom(!isNearBottom);

      // Load earlier messages logic
      if (
        container.scrollTop < 50 &&
        !isLoadingMoreUp &&
        !reachedTop &&
        loadedPages.length > 0
      ) {
        const oldestLoadedPage = Math.min(...loadedPages);

        // Only load if there are earlier pages
        if (oldestLoadedPage > 0) {
          const nextPageToLoad = oldestLoadedPage - 1;

          // Trigger loading
          if (triggerPageLoad(nextPageToLoad)) {
            setIsLoadingMoreUp(true);
            setLastScrollHeight(container.scrollHeight);
          }
        } else if (oldestLoadedPage === 0) {
          // Already at first page, mark as reached top
          setReachedTop(true);
        }
      }
    }, 150); // 150ms debounce time

    const handleScroll = () => debouncedScrollHandler();
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadedPages, isLoadingMoreUp, reachedTop, debounce, triggerPageLoad]);

  // Add: Initial load check - ensure enough messages are loaded
  useEffect(() => {
    // Only execute when messages are loaded and count is significantly less than expected
    if (
      validChannelId &&
      !currentQueryPage &&
      loadedPages.length > 0 &&
      messageCount > 20 &&
      allMessages.length < 20 &&
      !isMessagesLoading
    ) {
      // Check which pages are missing
      const missingPages = [];
      for (let i = Math.max(0, latestPage - 2); i <= latestPage; i++) {
        if (!loadedPages.includes(i)) {
          missingPages.push(i);
        }
      }

      // Load missing pages
      if (missingPages.length > 0) {
        missingPages.forEach((page, index) => {
          setTimeout(() => triggerPageLoad(page), index * 300);
        });
      } else {
        // If latest pages are loaded but message count is still insufficient, try loading earlier pages
        const earliestPage = Math.max(0, Math.min(...loadedPages) - 1);
        if (earliestPage >= 0 && !loadedPages.includes(earliestPage)) {
          triggerPageLoad(earliestPage);
        }
      }
    }
  }, [
    validChannelId,
    allMessages.length,
    messageCount,
    loadedPages,
    currentQueryPage,
    latestPage,
    isMessagesLoading,
    triggerPageLoad,
  ]);

  // Handle channel ID changes
  useEffect(() => {
    if (!channelId) return;

    // Reset all states
    setAllMessages([]);
    setLoadedPages([]);
    setIsAtBottom(true);
    setShowScrollToBottom(false);
    setNewMessageCount(0);
    setLastMessageCount(0);
    setReachedTop(false);
    setIsLoadingMoreUp(false);
    setLastScrollHeight(0);
    setCurrentQueryPage(null);

    setAutoRefreshTrigger((prev) => prev + 1);
  }, [channelId]);

  useEffect(() => {
    if (validChannelId) {
      setAutoRefreshTrigger((prev) => prev + 1);

      const timer = setTimeout(() => {
        if (messageCount > 0) {
          const latestPage = Math.ceil(messageCount / MESSAGES_PER_PAGE) - 1;
          const startPage = Math.max(0, latestPage - 2); // load recent 3 pages

          // load pages in order
          for (let page = startPage; page <= latestPage; page++) {
            setTimeout(
              () => {
                if (!loadedPages.includes(page)) {
                  setCurrentQueryPage(page);
                }
              },
              (page - startPage) * 200,
            );
          }
        } else {
          setCurrentQueryPage(0);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [validChannelId, messageCount, loadedPages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // check if near top
      const isNearTop = container.scrollTop < 50;

      // if near top and there are more history messages to load
      if (
        isNearTop &&
        !isLoadingMoreUp &&
        !reachedTop &&
        loadedPages.length > 0
      ) {
        const oldestLoadedPage = Math.min(...loadedPages);

        // if there are earlier pages
        if (oldestLoadedPage > 0) {
          const nextPageToLoad = oldestLoadedPage - 1;

          // trigger loading
          if (!loadedPages.includes(nextPageToLoad)) {
            setIsLoadingMoreUp(true);
            setLastScrollHeight(container.scrollHeight);
            setCurrentQueryPage(nextPageToLoad);
          }
        } else {
          // already reached the first page
          setReachedTop(true);
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadedPages, isLoadingMoreUp, reachedTop]);

  useEffect(() => {
    if (pageMessages && pageMessages.length > 0) {
      if (!loadedPages.includes(currentQueryPage || 0)) {
        setLoadedPages((prev) => [...prev, currentQueryPage || 0]);
      }

      setAllMessages((prev) => {
        const existingIndices = new Set(prev.map((m) => m.index));
        const newMessages = pageMessages.filter(
          (msg) => !existingIndices.has(msg.index),
        );
        const combinedMessages = [...prev, ...newMessages];
        return combinedMessages.sort((a, b) => a.index - b.index);
      });

      scrollToBottom();
      setCurrentQueryPage(null);
      setIsLoadingMoreUp(false);
    }
  }, [pageMessages, currentQueryPage, loadedPages]);

  useEffect(() => {
    if (isError && validChannelId) {
      const retryTimer = setTimeout(() => {
        if (currentQueryPage !== null) {
          setCurrentQueryPage(null);
          setTimeout(() => triggerPageLoad(currentQueryPage), 100);
        } else if (messageCount > 0) {
          const latestPage = Math.ceil(messageCount / MESSAGES_PER_PAGE) - 1;
          triggerPageLoad(latestPage);
        }
      }, 1000);

      return () => clearTimeout(retryTimer);
    }
  }, [
    isError,
    validChannelId,
    currentQueryPage,
    messageCount,
    triggerPageLoad,
  ]);

  // Scroll to bottom (when receiving new messages)
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current && !isLoadingMoreUp) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [allMessages, isAtBottom, isLoadingMoreUp]);

  // Maintain scroll position (when loading earlier messages)
  useEffect(() => {
    if (!isLoadingMoreUp || !messagesContainerRef.current) return;

    const container = messagesContainerRef.current;

    if (lastScrollHeight > 0 && container.scrollHeight > lastScrollHeight) {
      container.scrollTop = container.scrollHeight - lastScrollHeight;
    }
  }, [allMessages, isLoadingMoreUp, lastScrollHeight]);

  // Listen for scroll events
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Determine if near bottom
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;

      setIsAtBottom(isNearBottom);
      setShowScrollToBottom(!isNearBottom);

      // Load more old messages when reaching top
      if (
        container.scrollTop < 50 &&
        !isLoadingMoreUp &&
        !reachedTop &&
        loadedPages.length > 0
      ) {
        const oldestLoadedPage = Math.min(...loadedPages);

        // Only load if there are earlier pages available
        if (oldestLoadedPage > 0) {
          const nextPageToLoad = oldestLoadedPage - 1;

          // Prevent loading the same page repeatedly
          if (!loadedPages.includes(nextPageToLoad)) {
            setIsLoadingMoreUp(true);
            setLastScrollHeight(container.scrollHeight);
            setCurrentQueryPage(nextPageToLoad);
          }
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadedPages, isLoadingMoreUp, reachedTop]);

  // Detect new messages and update counter
  useEffect(() => {
    // First load doesn't count
    if (lastMessageCount === 0) {
      setLastMessageCount(messageCount);
      return;
    }

    // If there are new messages and user is not at bottom, show notification
    if (messageCount > lastMessageCount && !isAtBottom) {
      const newCount = messageCount - lastMessageCount;
      setNewMessageCount((prev) => prev + newCount);
      // Refresh latest page messages
      if (!loadedPages.includes(latestPage)) {
        setCurrentQueryPage(latestPage);
      } else {
        refetchMessages();
      }
    } else if (messageCount > lastMessageCount && isAtBottom) {
      // User is at bottom, directly refresh latest messages
      if (!loadedPages.includes(latestPage)) {
        setCurrentQueryPage(latestPage);
      } else {
        refetchMessages();
      }
    }

    setLastMessageCount(messageCount);
  }, [
    messageCount,
    isAtBottom,
    lastMessageCount,
    latestPage,
    loadedPages,
    refetchMessages,
  ]);

  // Handler for scrolling to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      setIsAtBottom(true);
      setShowScrollToBottom(false);
      setNewMessageCount(0);
    }
  }, []);

  // Determine message sender type
  const isCurrentUser = useCallback(
    (message: Message) => {
      return message.sender === currentAddress;
    },
    [currentAddress],
  );

  const isAI = useCallback(
    (message: Message) => {
      if (!agentAddress) return false;
      try {
        const messageSender = new RoochAddress(
          message.sender,
        ).toBech32Address();
        const agentAddr = new RoochAddress(agentAddress).toBech32Address();
        return messageSender === agentAddr;
      } catch (error) {
        console.error("Error comparing addresses:", error);
        return false;
      }
    },
    [agentAddress],
  );

  // Manually trigger loading (internal use, no button exposed)
  // const triggerLoad = useCallback(() => {
  //   setAutoRefreshTrigger((prev) => prev + 1);
  // }, []);

  // detect AI thinking state
  useEffect(() => {
    if (allMessages.length === 0 || !agentAddress) return;

    // find the last message sent to agent
    const lastMessageToAgent = [...allMessages].reverse().find((m) => {
      if (!isCurrentUser(m)) return false;

      return m.mentions.some((mention) => {
        try {
          const mentionAddress = new RoochAddress(mention).toBech32Address();
          const agentAddr = new RoochAddress(agentAddress).toBech32Address();
          return mentionAddress === agentAddr;
        } catch (error) {
          console.error("Error parsing addresses:", error);
          return false;
        }
      });
    });

    // if no message sent to agent, close thinking state
    if (!lastMessageToAgent) {
      onAIThinkingChange?.(false);
      return;
    }

    // check if AI has replied to this message
    const hasReply = allMessages.some(
      (m) =>
        isAI(m) &&
        m.reply_to === lastMessageToAgent.index &&
        m.index > lastMessageToAgent.index,
    );

    // only set thinking state when there is no reply
    onAIThinkingChange?.(!hasReply);
  }, [allMessages, isCurrentUser, isAI, onAIThinkingChange, agentAddress]);

  return (
    <div
      ref={messagesContainerRef}
      className="relative h-[50vh] space-y-4 overflow-y-auto p-4 md:h-full"
    >
      {/* Top loading status */}
      {isLoadingMoreUp && (
        <div className="py-2 text-center text-gray-500">
          Loading more messages...
        </div>
      )}

      {/* Reached top notification */}
      {reachedTop && !isLoadingMoreUp && (
        <div className="py-2 text-center text-gray-500">
          This is the beginning of the conversation
        </div>
      )}

      {/* Message loading status */}
      {allMessages.length === 0 && isMessagesLoading && (
        <div className="flex flex-col items-center justify-center py-4">
          <div className="mb-2 h-6 w-6 animate-spin rounded-full border-b-2 border-indigo-500"></div>
          <div className="text-gray-500">Loading messages...</div>
        </div>
      )}

      {/* Message list */}
      {allMessages.length === 0 && !isMessagesLoading ? (
        <div className="py-2 text-center text-gray-500">
          No messages yet, start chatting!
        </div>
      ) : (
        allMessages.map((message) => (
          <ChatMessage
            key={`${message.index}-${message.channel_id}`}
            message={message}
            isCurrentUser={isCurrentUser(message)}
            isAI={isAI(message)}
            agentName={agentName}
            agentId={agentId}
            messages={allMessages}
          />
        ))
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center space-x-2 rounded-full bg-indigo-600 px-4 py-2 text-white shadow-lg transition-colors hover:bg-indigo-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            {newMessageCount > 0
              ? `${newMessageCount} new messages`
              : "Scroll to bottom"}
          </span>
        </button>
      )}
    </div>
  );
}
