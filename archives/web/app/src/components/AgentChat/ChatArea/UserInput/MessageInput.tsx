import { useAgentChat } from "@/contexts/AgentChatContext";
import { useChannelJoin } from "@/hooks/useChannelJoin";
import { useChannelMessageSend } from "@/hooks/useChannelMessageSend";
import { useNetworkVariable } from "@/hooks/useNetworks";
import { PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { RoochAddress, toShortStr } from "@roochnetwork/rooch-sdk";
import {
  useCreateSessionKey,
  useCurrentSession,
} from "@roochnetwork/rooch-sdk-kit";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ActionPanel } from "./ActionPanel";
import { LoadingButton } from "./LoadingButton";
import { TransferModal } from "./TransferModal";

/**
 * Props for the MessageInput component
 */
interface MessageInputProps {
  /** Ref to scroll to end of messages */
  messagesEndRef?: React.RefObject<HTMLDivElement>;
}

/**
 * MessageInput component - Input area for sending messages
 * Features:
 * - Text input for message composition
 * - Send/Join button with loading state
 * - Session key guard for secure operations
 * - Enter key support for sending messages
 * - Integrated channel joining and message sending functionality
 * - Token transfer functionality
 */
export function MessageInput({ messagesEndRef }: MessageInputProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [autoMentionAI, setAutoMentionAI] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionSearchText, setMentionSearchText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentions, setMentions] = useState<
    Array<{ id: string; text: string; type: "user" | "agent" }>
  >([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const packageId = useNetworkVariable("packageId");
  const session = useCurrentSession();
  const { mutate: createSession, isPending: isCreateSessionPending } =
    useCreateSessionKey();
  console.log(
    "🚀 ~ MessageInput.tsx:54 ~ MessageInput ~ isCreateSessionPending:",
    isCreateSessionPending
  );
  const {
    agent,
    selectedChannel,
    members,
    isJoined,
    refetchJoinStatus,
    refetchJoinedAgent,
    refetchChannelMembers,
    refetchMessageCount,
    refetchMessages,
  } = useAgentChat();

  // Message sending functionality
  const { mutateAsync: sendMessage, isPending: sendingMessage } =
    useChannelMessageSend();
  // Channel joining functionality
  const { mutateAsync: joinChannel, isPending: joiningChannel } =
    useChannelJoin();

  // TODO: remove this with sdk-kit export session config
  const sessionCfg = {
    appName: "Nuwa AI Agents",
    appUrl: "https://nuwa.rooch.io/",
    scopes: [`${packageId}::*::*`, `0x3::*::*`],
    maxInactiveInterval: 3600,
  };

  // Add auto-scroll effect
  useEffect(() => {
    if (showMentionList && mentionListRef.current) {
      const selectedElement = mentionListRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        const container = mentionListRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = selectedElement.getBoundingClientRect();

        // If the selected element is below the container bottom
        if (elementRect.bottom > containerRect.bottom) {
          container.scrollTop += elementRect.bottom - containerRect.bottom;
        }
        // If the selected element is above the container top
        else if (elementRect.top < containerRect.top) {
          container.scrollTop -= containerRect.top - elementRect.top;
        }
      }
    }
  }, [selectedIndex, showMentionList]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionListRef.current &&
        !mentionListRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowMentionList(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /**
   * Handle message sending and channel joining
   * If user hasn't joined the channel, join first
   * Then send the message and update the UI
   */
  const handleSendMessage = async (message: string, payment?: number) => {
    if ((message.trim() || mentions.length > 0) && selectedChannel && agent) {
      try {
        // check message length
        if (message.length > 4096) {
          console.log("Message too long, showing error toast");
          toast.error("Message is too long", {
            position: "top-center",
          });
          return;
        }

        // build message content with mentions
        const mentionText = mentions.map((m) => `@${m.text}`).join(" ");
        const fullMessage = `${mentionText} ${message}`.trim();

        // check full message length (includes mentions)
        if (fullMessage.length > 4096) {
          console.log("Full message too long, showing error toast");
          toast.error("Message is too long", {
            position: "top-center",
          });
          return;
        }

        const messageData: any = {
          channelId: selectedChannel,
          content: fullMessage,
          mentions: [
            ...mentions.map((m) => m.id),
            ...(autoMentionAI && agent.address ? [agent.address] : []),
          ],
          aiAddress: agent.address,
        };

        if (payment) {
          messageData.payment = payment;
          messageData.content = message;
        }

        try {
          await sendMessage(messageData);
          await refetchMessageCount();
          await refetchMessages();
          messagesEndRef?.current?.scrollIntoView({ behavior: "smooth" });
          // Clear mentions and reset token form
          setMentions([]);
          setShowTransferModal(false);
          // only clean the input when message send success
          setInputMessage("");
        } catch (error: any) {
          // check if the error is session key expired
          if (error?.message?.includes("1012")) {
            console.log("Session key expired, creating new session");
            // create new session key
            createSession(sessionCfg);
          } else {
            throw error;
          }
        }
      } catch (e) {
        console.log(e);
      }
    }
  };

  const handleAction = async () => {
    console.log("🚀 ~ MessageInput.tsx:199 ~ handleAction ~ session:", session);
    if (!session) {
      createSession(sessionCfg);
      return;
    }

    if (!isJoined) {
      try {
        if (!selectedChannel) {
          console.log("No channel selected");
          return;
        }
        await joinChannel({ id: selectedChannel });
        await refetchJoinStatus();
        await refetchJoinedAgent();
        await refetchChannelMembers();
        return;
      } catch (e) {
        console.log(e);
        return;
      }
    }

    if (inputMessage.trim()) {
      if (inputMessage.length > 4096) {
        toast.error("Message is too long", {
          position: "top-center",
        });
        return;
      }

      const mentionText = mentions.map((m) => `@${m.text}`).join(" ");
      const fullMessage = `${mentionText} ${inputMessage}`.trim();

      if (fullMessage.length > 4096) {
        toast.error("Message is too long", {
          position: "top-center",
        });
        return;
      }

      await handleSendMessage(inputMessage);
      if (inputRef.current) {
        inputRef.current.style.height = "24px";
      }
    }
  };

  const handleTransfer = (amount: string, message: string) => {
    if (parseFloat(amount) > 0) {
      const rawAmount = (parseFloat(amount) * 100000000).toFixed(0);
      handleSendMessage(message, parseInt(rawAmount));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    const lastAtSymbol = value.lastIndexOf("@", cursorPosition);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      const newHeight = Math.max(inputRef.current.scrollHeight, 24);
      inputRef.current.style.height = `${newHeight}px`;
    }

    if ((e.nativeEvent as InputEvent).inputType === "insertFromPaste") {
      const pastedText = value;
      const mentionRegex = /@(\w+)/g;
      let match;
      const newMentions: Array<{
        id: string;
        text: string;
        type: "user" | "agent";
      }> = [];
      let processedText = pastedText;

      while ((match = mentionRegex.exec(pastedText)) !== null) {
        const mentionText = match[1];
        const member = allMembers.find(
          (m) =>
            m.username?.toLowerCase() === mentionText.toLowerCase() ||
            m.name?.toLowerCase() === mentionText.toLowerCase()
        );

        if (member) {
          const displayName = member.username || member.name || member.address;
          newMentions.push({
            id: member.address,
            text: displayName,
            type: member.isAgent ? "agent" : "user",
          });
          processedText = processedText.replace(`@${mentionText}`, "");
        }
      }

      if (newMentions.length > 0) {
        setMentions((prev) => {
          const existingMentionIds = new Set(prev.map((m) => m.id));
          const uniqueNewMentions = newMentions.filter(
            (m) => !existingMentionIds.has(m.id)
          );
          return [...prev, ...uniqueNewMentions];
        });
        setInputMessage(processedText.trim());
        return;
      }
    }

    if (lastAtSymbol !== -1) {
      const searchText = value.slice(lastAtSymbol + 1, cursorPosition);
      setMentionSearchText(searchText);

      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        const textBeforeCursor = value.slice(0, cursorPosition);
        const tempSpan = document.createElement("span");
        tempSpan.style.visibility = "hidden";
        tempSpan.style.position = "absolute";
        tempSpan.style.whiteSpace = "pre-wrap";
        tempSpan.style.font = window.getComputedStyle(inputRef.current).font;
        tempSpan.textContent = textBeforeCursor;
        document.body.appendChild(tempSpan);

        document.body.removeChild(tempSpan);

        // Calculate dropdown list position
        const itemHeight = 48; // Estimated height for each list item
        const maxVisibleItems = 4; // Maximum number of visible items
        const padding = 16; // List padding
        const searchLower = searchText.toLowerCase();
        const filteredCount = allMembers.filter(
          (member) =>
            member.name?.toLowerCase().includes(searchLower) ||
            member.username?.toLowerCase().includes(searchLower) ||
            member.address.toLowerCase().includes(searchLower)
        ).length;

        const listHeight = Math.min(
          filteredCount * itemHeight + padding,
          maxVisibleItems * itemHeight + padding
        );
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const shouldShowUp = spaceBelow < listHeight && spaceAbove > spaceBelow;

        setMentionPosition({
          top: shouldShowUp ? rect.top - listHeight : rect.bottom,
          left: rect.left,
        });
      }

      setShowMentionList(true);
    } else {
      setShowMentionList(false);
    }

    setInputMessage(value);
  };

  const handleMentionSelect = (member: {
    address: string;
    name?: string;
    username?: string;
    isAgent?: boolean;
  }) => {
    const displayName = member.username || member.name || member.address;

    // Add new mention
    setMentions((prev) => [
      ...prev,
      {
        id: member.address,
        text: displayName,
        type: member.isAgent ? "agent" : "user",
      },
    ]);

    // Keep the text after @ symbol
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const lastAtSymbol = inputMessage.lastIndexOf("@", cursorPosition);
    if (lastAtSymbol !== -1) {
      const textBeforeAt = inputMessage.slice(0, lastAtSymbol);
      const textAfterCursor = inputMessage.slice(cursorPosition);
      const newMessage = textBeforeAt + " " + textAfterCursor;
      setInputMessage(newMessage);
    }

    setShowMentionList(false);

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleRemoveMention = (mentionId: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== mentionId));
  };

  // Add agent to the member list
  const allMembers = members.map((member) => {
    if (member.address === agent?.address) {
      return {
        ...member,
        name: agent.name,
        username: agent.username,
        avatar: agent.avatar || member.avatar,
        isAgent: true,
      };
    }
    return {
      ...member,
      isAgent: false,
    };
  });

  // Move agent to the top of the list
  const sortedMembers = [...members].sort((a, b) => {
    const aAddr = new RoochAddress(a.address).toHexAddress();
    const bAddr = new RoochAddress(b.address).toHexAddress();
    const agentAddr = new RoochAddress(agent?.address || "").toHexAddress();
    if (aAddr === agentAddr) return -1;
    if (bAddr === agentAddr) return 1;
    return 0;
  });

  // Filter member list based on search text
  const filteredMembers = sortedMembers.filter((member) => {
    const searchLower = mentionSearchText.toLowerCase();
    return (
      member.name?.toLowerCase().includes(searchLower) ||
      member.username?.toLowerCase().includes(searchLower) ||
      member.address.toLowerCase().includes(searchLower)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing || e.nativeEvent.isComposing) {
      return;
    }
    if (showMentionList && filteredMembers.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredMembers.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredMembers.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredMembers[selectedIndex]) {
            handleMentionSelect(filteredMembers[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowMentionList(false);
          setSelectedIndex(0);
          break;
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAction();
    } else if (
      e.key === "Backspace" &&
      inputMessage === "" &&
      mentions.length > 0
    ) {
      // When input is empty and there are tags, delete the last tag
      e.preventDefault();
      const lastMention = mentions[mentions.length - 1];
      handleRemoveMention(lastMention.id);
    }
  };

  const handleAutoMentionToggle = () => {
    setAutoMentionAI(!autoMentionAI);
  };

  if (!agent || !selectedChannel) {
    return null;
  }

  return (
    <div className="shrink-0 px-4 pt-4   border-gray-200 dark:border-gray-700 mb-2">
      <div className="flex space-x-2">
        {/* Message input field - only shown when joined */}
        {isJoined && (
          <div className="flex-1 relative">
            <div className="flex flex-wrap items-center w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 focus-within:ring-2 focus-within:ring-purple-500 min-h-[40px]">
              {mentions.map((mention) => (
                <div
                  key={mention.id}
                  className={`inline-flex items-center text-xs px-2 py-1 rounded-full group relative cursor-pointer ${
                    mention.type === "agent"
                      ? "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  } mb-1 mr-1`}
                  onClick={() => handleRemoveMention(mention.id)}
                >
                  <span className="leading-none group-hover:invisible">
                    @{mention.text}
                  </span>
                  <XMarkIcon className="w-3.5 h-3.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden group-hover:block" />
                </div>
              ))}
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => {
                  setTimeout(() => setIsComposing(false), 0);
                }}
                placeholder={mentions.length > 0 ? "" : "Type a message..."}
                className="flex-1 bg-transparent outline-none text-sm resize-none py-0 min-h-[24px]"
                rows={1}
              />
            </div>

            {/* Mention List */}
            {showMentionList && filteredMembers.length > 0 && (
              <div
                ref={mentionListRef}
                className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-y-auto"
                style={{
                  top: mentionPosition.top,
                  left: mentionPosition.left,
                  minWidth: "200px",
                  maxHeight: `${Math.min(
                    filteredMembers.length * 48 + 16,
                    4 * 48 + 16
                  )}px`,
                }}
              >
                {filteredMembers.map((member, index) => {
                  const isAgent =
                    new RoochAddress(member.address).toHexAddress() ===
                    new RoochAddress(agent?.address || "").toHexAddress();
                  return (
                    <div
                      key={member.address}
                      className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                        index === selectedIndex
                          ? "bg-gray-100 dark:bg-gray-700"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedIndex(index);
                        handleMentionSelect(member);
                      }}
                    >
                      <div className="font-medium flex items-center">
                        {member.name ||
                          member.username ||
                          toShortStr(
                            new RoochAddress(member.address).toBech32Address()
                          )}
                        {isAgent && (
                          <span className="ml-2 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded font-semibold">
                            AI Agent
                          </span>
                        )}
                      </div>
                      {member.name && member.username && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          @{member.username}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Send/Join button with session key guard */}
        {/* <SessionKeyGuard onClick={handleAction}> */}
        <LoadingButton
          isPending={sendingMessage || joiningChannel || isCreateSessionPending}
          className={`${
            isJoined
              ? "h-[40px] w-[40px] flex items-center justify-center !p-0"
              : "w-full h-[40px]"
          }`}
          onClick={() => {
            handleAction();
          }}
          disabled={isJoined && !inputMessage.trim() && mentions.length === 0}
        >
          {isJoined ? <PaperAirplaneIcon className="w-7 h-7" /> : <>Join</>}
        </LoadingButton>
        {/* </SessionKeyGuard> */}
      </div>

      {/* Action Panel */}
      {isJoined && (
        <ActionPanel
          onTransferClick={() => setShowTransferModal(true)}
          autoMentionAI={autoMentionAI}
          onAutoMentionToggle={handleAutoMentionToggle}
        />
      )}

      {/* Transfer Modal */}
      {showTransferModal && agent && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={handleTransfer}
          agentName={agent.name || agent.username}
          agentAddress={agent.address}
        />
      )}
    </div>
  );
}
