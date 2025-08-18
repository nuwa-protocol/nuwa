import { useAgentChat } from "@/contexts/AgentChatContext";
import useUserInfo from "@/hooks/useUserInfo";
import {
  ActionEvent,
  ChatMessageProps,
  MESSAGE_TYPE,
  TransferAttachment,
} from "@/types/message";
import { shortenAddress } from "@/utils/address";
import { formatTimestamp } from "@/utils/time";
import { ClipboardDocumentIcon, ShareIcon } from "@heroicons/react/24/outline";
import { CheckIcon, UserCircleIcon } from "@heroicons/react/24/solid";
import { RoochAddress } from "@roochnetwork/rooch-sdk";
import React, { ComponentPropsWithoutRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

// add helper function to get user info and display name
const useUserDisplay = (address: string) => {
  const { userInfo } = useUserInfo(address);
  const displayName =
    (userInfo?.username != "" && `@` + userInfo?.username) ||
    userInfo?.name ||
    shortenAddress(address);
  return { userInfo, displayName };
};

// add user link component
const UserLink = ({ address }: { address: string }) => {
  const { displayName } = useUserDisplay(address);
  return (
    <Link to={`/profile/${address}`} className="text-blue-600 hover:underline">
      {displayName}
    </Link>
  );
};

export function ChatMessage({
  message,
  isCurrentUser,
  isAI,
  hasPaidContent,
  messages,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const { agent } = useAgentChat();
  const { userInfo } = useUserInfo(message.sender);

  const timestamp = message.timestamp;
  const isActionEvent = message.message_type === MESSAGE_TYPE.ACTION_EVENT;
  const senderAddress = new RoochAddress(message.sender).toBech32Address();

  // // get recipient address
  // const recipientAddress = React.useMemo(() => {
  //   if (!isActionEvent) return null;
  //   try {
  //     const actionEvent = JSON.parse(message.content);
  //     const args = JSON.parse(actionEvent.args);
  //     return args.to;
  //   } catch (error) {
  //     console.error("Failed to parse action event:", error);
  //     return null;
  //   }
  // }, [isActionEvent, message.content]);

  // check if message contains transfer attachment
  const hasTransferAttachment = React.useMemo(() => {
    return message.attachments.some((attachment) => {
      try {
        const data = JSON.parse(
          attachment.attachment_json,
        ) as TransferAttachment;
        return data.amount && data.coin_type && data.to;
      } catch (error) {
        return false;
      }
    });
  }, [message.attachments]);

  // get transfer attachment info
  const transferAttachment = React.useMemo(() => {
    if (!hasTransferAttachment) return null;
    const attachment = message.attachments.find((attachment) => {
      try {
        const data = JSON.parse(
          attachment.attachment_json,
        ) as TransferAttachment;
        return data.amount && data.coin_type && data.to;
      } catch (error) {
        return false;
      }
    });
    return attachment
      ? (JSON.parse(attachment.attachment_json) as TransferAttachment)
      : null;
  }, [message.attachments, hasTransferAttachment]);

  // check if message is sent to AI
  const isToAI = React.useMemo(() => {
    if (!agent?.address) return false;
    return message.mentions.some((mention) => {
      try {
        const mentionAddress = new RoochAddress(mention).toBech32Address();
        return mentionAddress === agent.address;
      } catch (error) {
        console.error("Error parsing mention address:", error);
        return false;
      }
    });
  }, [message.mentions, agent?.address]);

  // Use the agent's actual name if provided, otherwise fallback to address
  const displayName = isAI
    ? agent?.name || "AI Agent"
    : userInfo?.name || shortenAddress(senderAddress);

  const handleCopy = async () => {
    const shareText = `${message.content}\n\n${window.location.href}`;
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const shareText = `${message.content}\n\n${window.location.href}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText,
    )}`;
    window.open(twitterUrl, "_blank");
  };

  // Parse action event if message type is ACTION_EVENT
  const parseActionEvent = (): ActionEvent | null => {
    if (!isActionEvent) return null;

    try {
      return JSON.parse(message.content);
    } catch (error) {
      console.error("Failed to parse action event:", error);
      return null;
    }
  };

  // Format action arguments for display
  const formatActionArgs = (argsJson: string): any => {
    try {
      return JSON.parse(argsJson);
    } catch (error) {
      return argsJson;
    }
  };

  // Get a human-friendly event message based on action type
  const getActionEventMessage = (actionEvent: ActionEvent): JSX.Element => {
    const args = formatActionArgs(actionEvent.args);

    // For transfer actions
    if (actionEvent.action.startsWith("transfer::")) {
      // For transfer::coin action
      if (actionEvent.action === "transfer::coin") {
        const amount = args.amount || "some";
        const coinType = args.coin_type
          ? args.coin_type.split("::").pop()
          : "coins";

        return (
          <span>
            {actionEvent.success ? "Agent Transferred " : "Failed to transfer "}
            <span className="font-medium">
              {amount} {coinType}
            </span>{" "}
            to <UserLink address={args.to} />
            {args.memo && <span className="italic"> - "{args.memo}"</span>}
          </span>
        );
      }
    }

    // For memory actions
    else if (actionEvent.action.startsWith("memory::")) {
      if (actionEvent.action === "memory::add") {
        const args = formatActionArgs(actionEvent.args);
        return (
          <span>
            Agent added a new memory about <UserLink address={args.addr} />
          </span>
        );
      } else if (actionEvent.action === "memory::update") {
        const args = formatActionArgs(actionEvent.args);
        return (
          <span>
            Agent updated memory at index {args.index} for{" "}
            <UserLink address={args.addr} />
          </span>
        );
      } else if (actionEvent.action === "memory::remove") {
        const args = formatActionArgs(actionEvent.args);
        return (
          <span>
            Agent removed memory at index {args.index} for{" "}
            <UserLink address={args.addr} />
          </span>
        );
      } else if (actionEvent.action === "memory::compact") {
        const args = formatActionArgs(actionEvent.args);
        return (
          <span>
            Agent compacted memories for <UserLink address={args.addr} />
          </span>
        );
      } else if (actionEvent.action === "memory::none") {
        const args = formatActionArgs(actionEvent.args);
        return (
          <span>
            No new memories saved{args.reason ? ` — ${args.reason}` : ""}
          </span>
        );
      }
    }

    // Default fallback for other actions
    const actionName = actionEvent.action.split("::").join("::");
    return (
      <span>
        Executed <span className="font-medium">{actionName}</span>
        {actionEvent.success ? "" : " (failed)"}
      </span>
    );
  };

  // Render action event content in IM-style
  const renderActionEvent = () => {
    const actionEvent = parseActionEvent();
    if (!actionEvent)
      return <div className="text-red-500">Invalid action event format</div>;

    // Get appropriate icon based on action type
    const getActionIcon = () => {
      if (actionEvent.action.startsWith("transfer::")) {
        return "💸";
      } else if (actionEvent.action.startsWith("memory::")) {
        return "🧠";
      } else {
        return "⚙️";
      }
    };

    return (
      <div className="py-1 text-center text-sm text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span>{getActionIcon()}</span>
          {getActionEventMessage(actionEvent)}
          {actionEvent.error ? (
            <span className="ml-1 text-red-500">
              — Error: {actionEvent.error}
            </span>
          ) : (
            ""
          )}
        </span>
      </div>
    );
  };

  // For action events, return a simplified centered message
  if (isActionEvent) {
    return (
      <div className="my-1 flex w-full justify-center">
        <div className="w-full">{renderActionEvent()}</div>
      </div>
    );
  }

  // get replied message
  const getReplyToMessage = () => {
    if (!messages || message.reply_to === -1) return null;
    return messages.find((m) => m.index === message.reply_to);
  };

  const replyToMessage = getReplyToMessage();
  const { userInfo: replyToUserInfo } = useUserInfo(replyToMessage?.sender);

  // for normal messages, use the existing format
  return (
    <div className="flex w-full">
      <div className="flex w-full gap-3">
        {!isCurrentUser && (
          <div className="h-8 w-8 flex-shrink-0">
            {isAI ? (
              // Wrap the avatar in a Link component if agentId is provided
              agent ? (
                <Link
                  to={`/profile/${agent.username}`}
                  className="block h-8 w-8 cursor-pointer rounded-full transition-all hover:ring-2 hover:ring-blue-300"
                  title={`View ${agent.name || "AI Agent"}'s profile`}
                >
                  {agent?.avatar ? (
                    <img
                      src={agent.avatar}
                      alt={agent.name || "AI Agent"}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm font-bold text-white">
                      {agent.name
                        ? agent.name.substring(0, 2).toUpperCase()
                        : "AI"}
                    </div>
                  )}
                </Link>
              ) : (
                // Original div if no agentId provided
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm font-bold text-white">
                  {"AI"}
                </div>
              )
            ) : (
              // User avatar with profile link
              <Link
                to={`/profile/${senderAddress}`}
                className="block h-8 w-8 cursor-pointer rounded-full transition-all hover:ring-2 hover:ring-blue-300"
                title={`View ${shortenAddress(senderAddress)}'s profile`}
              >
                {userInfo?.avatar ? (
                  <img
                    src={userInfo.avatar}
                    alt={userInfo.name || shortenAddress(senderAddress)}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <UserCircleIcon className="h-8 w-8 text-gray-400" />
                )}
              </Link>
            )}
          </div>
        )}
        <div
          className={`flex w-[calc(100%-48px)] flex-1 flex-col ${
            isCurrentUser ? "items-end" : "items-start"
          }`}
        >
          <div className="mb-1 flex gap-2 text-xs text-gray-500">
            <span className="font-medium">
              {isCurrentUser ? (
                "You"
              ) : isAI ? (
                displayName
              ) : (
                <Link
                  to={`/profile/${senderAddress}`}
                  className="transition-colors hover:text-blue-600 hover:underline"
                  title={`View ${shortenAddress(senderAddress)}'s profile`}
                >
                  {displayName}
                </Link>
              )}
            </span>
            {!isCurrentUser && !isAI && userInfo?.username && (
              <>
                <span>•</span>
                <span className="text-gray-400">@{userInfo.username}</span>
              </>
            )}
            <span>•</span>
            <span>{formatTimestamp(timestamp)}</span>
            {hasPaidContent && (
              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                Paid Message
              </span>
            )}
            {isCurrentUser && isToAI && (
              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                To Agent
              </span>
            )}
          </div>
          {replyToMessage && (
            <div
              className={`mb-1 rounded px-2 py-1 text-xs ${
                isAI
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-800/50 dark:text-purple-200"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800"
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  Reply to{" "}
                  {`@` + replyToUserInfo?.username ||
                    replyToUserInfo?.name ||
                    shortenAddress(
                      new RoochAddress(replyToMessage.sender).toBech32Address(),
                    )}
                </span>
                <span>
                  {replyToMessage.content.length > 50
                    ? `${replyToMessage.content
                        .replace(/^@\w+\s/, "")
                        .substring(0, 50)}...`
                    : replyToMessage.content.replace(/^@\w+\s/, "")}
                </span>
              </div>
            </div>
          )}
          <div className="group relative w-fit max-w-full">
            <div
              className={`w-full rounded-lg px-2 py-0.5 ${
                isAI
                  ? "bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-white"
                  : hasTransferAttachment
                    ? "border border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    : "border border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              }`}
            >
              {hasTransferAttachment && transferAttachment && (
                <div className="my-2 rounded-xl bg-purple-300/80 p-2 dark:bg-black/20">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-yellow-600 dark:text-yellow-400">
                      💸
                    </span>
                    <span>Transfer</span>
                    <span className="font-medium">
                      {transferAttachment.amount}
                    </span>
                    <span>
                      {transferAttachment.coin_type.split("::").pop()}
                    </span>
                    <span>
                      to Agent (
                      {`@` + agent?.username ||
                        agent?.name ||
                        agent?.address.substring(0, 8) +
                          "..." +
                          agent?.address.substring(agent.address.length - 6)}
                      )
                    </span>

                    {transferAttachment.memo && (
                      <span className="italic">
                        {" "}
                        — "{transferAttachment.memo}"
                      </span>
                    )}
                  </div>
                </div>
              )}
              {
                <div className="flex w-full flex-col items-start justify-between text-wrap">
                  <div className="w-fit max-w-full text-wrap text-sm leading-tight">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      className="chart-area-markdown prose prose-sm w-full max-w-none text-wrap dark:prose-invert prose-headings:m-0 prose-p:m-0 prose-blockquote:m-0 prose-pre:m-0 prose-ol:m-0 prose-ul:m-0 prose-li:m-0 prose-hr:m-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p:last-child]:mb-0"
                      components={{
                        pre: ({ children }) => children,
                        code: ({
                          inline,
                          className,
                          children,
                          ...props
                        }: ComponentPropsWithoutRef<"code"> & {
                          inline?: boolean;
                        }) => {
                          const match = /language-(\w+)/.exec(className || "");
                          const language = match ? match[1] : "";

                          return !inline ? (
                            <div className="my-1 text-wrap">
                              <SyntaxHighlighter
                                language={language}
                                style={oneLight}
                                customStyle={{
                                  backgroundColor:
                                    "var(--tw-prose-pre-bg, #f8fafc)",
                                  padding: "0.75rem",
                                  margin: 0,
                                  borderRadius: "0.375rem",
                                  border:
                                    "1px solid var(--tw-prose-pre-border, #e2e8f0)",
                                }}
                                className="dark:border-gray-700 dark:!bg-gray-800"
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code
                              className={`text-wrap rounded px-1.5 py-0.5 ${
                                isCurrentUser
                                  ? "bg-blue-200/70 text-blue-800 dark:bg-blue-500/30 dark:text-white"
                                  : "bg-gray-200/70 text-gray-800 dark:bg-gray-500/30 dark:text-white"
                              }`}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              }

              {/* move buttons to outside of bubble */}
              <div className="absolute -right-1 -top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={handleCopy}
                  className="rounded-full bg-gray-800/80 p-1 text-white transition-colors hover:bg-gray-700"
                  title="Copy message"
                >
                  {copied ? (
                    <CheckIcon className="h-3 w-3 text-green-500" />
                  ) : (
                    <ClipboardDocumentIcon className="h-3 w-3" />
                  )}
                </button>
                <button
                  onClick={handleShare}
                  className="rounded-full bg-gray-800/80 p-1 text-white transition-colors hover:bg-gray-700"
                  title="Share to Twitter"
                >
                  <ShareIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
        {isCurrentUser && (
          <div className="h-8 w-8 flex-shrink-0">
            {/* Add RoochScan link for current user's avatar too */}
            {senderAddress && (
              <Link
                to={`/profile/${senderAddress}`}
                className="block h-8 w-8 cursor-pointer rounded-full transition-all hover:ring-2 hover:ring-blue-300"
                title={`View your profile`}
              >
                {userInfo?.avatar ? (
                  <img
                    src={userInfo.avatar}
                    alt={userInfo.name || shortenAddress(senderAddress)}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <UserCircleIcon className="h-8 w-8 text-blue-400" />
                )}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
