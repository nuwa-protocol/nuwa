import { MotionConfig, motion } from "framer-motion";
import Image from "next/image";

// 使用Nuwa官方logo作为代理图标
const AgentIcon = () => (
  <div className="flex-shrink-0 mr-2">
    <div className="rounded-full border-2 border-indigo-600 bg-white p-1 flex items-center justify-center">
      <Image
        src="/nuwa.svg"
        alt="Nuwa Agent"
        width={20}
        height={20}
        className="text-indigo-600"
      />
    </div>
  </div>
);

const ChatBox = ({
  title,
  company,
  messages,
}: {
  title: string;
  company: string;
  messages: { role: "user" | "agent"; content: string }[];
}) => (
  <MotionConfig
    transition={{
      duration: 0.2,
      ease: "easeInOut",
    }}
  >
    <motion.div
      initial={{
        y: 0,
      }}
      animate={{
        y: -8,
      }}
      exit={{
        y: 0,
      }}
      className="w-full overflow-hidden rounded-lg border-2 border-zinc-900 bg-white p-8 md:p-12"
    >
      <div className="mb-6">
        <motion.div
          initial={{
            y: 12,
            opacity: 0,
          }}
          animate={{
            y: 0,
            opacity: 1,
          }}
          exit={{
            y: -12,
            opacity: 0,
          }}
          className="flex items-center"
        >
          <div className="rounded-full bg-white p-1.5 flex items-center justify-center mr-3">
            <Image
              src="/nuwa.svg"
              alt="Nuwa Agent"
              width={32}
              height={32}
              className="text-indigo-600"
            />
          </div>
          <div>
            <span className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{title}</span>
          </div>
        </motion.div>
      </div>

      <div className="space-y-4">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            initial={{
              y: 12,
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            exit={{
              y: -12,
              opacity: 0,
            }}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} items-start`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${message.role === "user"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-900"
                }`}
            >
              <p className="text-lg leading-relaxed">{message.content}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  </MotionConfig>
);

export const OPTIONS = [
  {
    title: "DeFi",
    Content: () => (
      <ChatBox
        title="DeFi Guardian"
        company="DeFi Protocol"
        messages={[
          {
            role: "user",
            content: "Rebalance my loan to avoid liquidation"
          },
          {
            role: "agent",
            content: "I'll help you rebalance your loan. I've analyzed your current position and market conditions. I'll adjust your collateral to maintain a safe health factor and prevent liquidation."
          }
        ]}
      />
    ),
  },
  {
    title: "Launchpad",
    Content: () => (
      <ChatBox
        title="Launch Scout"
        company="Launch Platform"
        messages={[
          {
            role: "user",
            content: "Find me projects with strong tokenomics launching next week"
          },
          {
            role: "agent",
            content: "I've found 3 promising projects launching next week with strong tokenomics, including vesting schedules, team allocations, and utility-focused token models. Would you like me to provide detailed analysis for each?"
          }
        ]}
      />
    ),
  },
  {
    title: "GameFi",
    Content: () => (
      <ChatBox
        title="GameFi Strategist"
        company="GameFi Studio"
        messages={[
          {
            role: "user",
            content: "Sell my rare items when prices peak and reinvest in breeding my NFT creatures"
          },
          {
            role: "agent",
            content: "I'll monitor market prices for your rare items and execute the sale when they reach peak value. Then I'll automatically reinvest the proceeds into breeding your NFT creatures for optimal returns."
          }
        ]}
      />
    ),
  },
  {
    title: "DEX",
    Content: () => (
      <ChatBox
        title="DEX Navigator"
        company="Decentralized Exchange"
        messages={[
          {
            role: "user",
            content: "Set a limit order for ETH at $3,000 and alert me if XYZ token drops 5%"
          },
          {
            role: "agent",
            content: "I've set up your limit order for ETH at $3,000. I'll also monitor XYZ token's price and notify you immediately if it drops by 5% from current levels."
          }
        ]}
      />
    ),
  },
  {
    title: "Money Market",
    Content: () => (
      <ChatBox
        title="Yield Optimizer"
        company="Money Market Protocol"
        messages={[
          {
            role: "user",
            content: "What are the current lending rates on your platform?"
          },
          {
            role: "agent",
            content: "Our lending rates are dynamically adjusted based on supply and demand. Currently, stablecoin lending rates range from 3-8% APY."
          }
        ]}
      />
    ),
  },
];
