import React from "react";
import { motion } from "framer-motion";
import { SectionHeading } from "../shared/SectionHeading";
import { SectionSubheading } from "../shared/SectionSubheading";
import {
  FiActivity,
  FiZap,
  FiAward,
  FiUserCheck,
  FiUsers,
  FiShield,
  FiDollarSign,
  FiPackage,
} from "react-icons/fi";
import {
  SiEthereum,
  SiBitcoin,
  SiBinance,
  SiPolygon,
  SiSolana,
} from "react-icons/si";
import { NetworkSui, NetworkAptos, NetworkBase } from "@web3icons/react";
import Image from "next/image";

// 统一管理所有文案
const BENEFITS_GRID_TEXTS = {
  heading: "Why Choose Nuwa for Your Web3 Protocol",
  subheading: "Nuwa makes your protocol smarter, more intuitive, and ready for mass adoption — without the need for complex backend work or infrastructure overhead.",
  integrations: {
    title: "Integrate with Web3 Across All Chains",
    subtitle: "Connect seamlessly with major blockchain ecosystems for unified web3 experiences.",
    more: "+50's more"
  },
  securityGovernance: {
    title: "Security Governance",
    subtitle: "Implement precise control over transaction security and permissions.",
    imageSrc: "/images/landing/Security Governance.png",
    imageAlt: "Security Governance illustration"
  },
  usageBasedPricing: {
    title: "Usage-Based Pricing",
    subtitle: "Only pay when users interact with your agent.",
    imageSrc: "/images/landing/Usage-Based Pricing.png",
    imageAlt: "Usage-Based Pricing illustration"
  },
  noSetupCost: {
    title: "No Setup Cost",
    subtitle: "Nuwa offers out-of-the-box solution, eliminating the need for setup costs.",
    imageSrc: "/images/landing/No Setup Cost.png",
    imageAlt: "No Setup Cost illustration"
  },
  userSovereignty: {
    title: "User Sovereignty",
    subtitle: "Keep valuable user interaction within your ecosystem."
  },
  brandControl: {
    title: "Brand Control",
    subtitle: "Maintain your unique branding and user experience."
  },
  expandedUserBase: {
    title: "Expanded User Base",
    subtitle: "A shared user base with Nuwa can expand your user base on the day-1 of your agent launch."
  },
  enhancedFunctionality: {
    title: "Enhanced Functionality",
    subtitle: "Unlock new product capabilities that would be difficult to implement through traditional user interfaces."
  },
  onChainAnalytics: {
    "title": "On-Chain Analytics",
    "subtitle": "Access comprehensive insights on user behavior and transaction patterns across your protocol.",
  }
};

const BenefitsGrid = () => {
  return (
    <motion.section
      transition={{
        staggerChildren: 0.1,
      }}
      initial="initial"
      whileInView="whileInView"
      className="relative mx-auto max-w-6xl px-4 sm:px-6"
    >
      <div className="col-span-3 flex w-full flex-col items-center justify-center text-center mb-8 ">
        <SectionHeading>{BENEFITS_GRID_TEXTS.heading}</SectionHeading>
        <SectionSubheading>
          {BENEFITS_GRID_TEXTS.subheading}
        </SectionSubheading>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
        {/* Integrations Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-2 sm:col-span-2 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-start h-4 md:h-8">
            <p className="text-md sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.integrations.title}</p>
          </div>
          <p className="mb-2 mt-2 md:mt-2 text-xs sm:text-base">{BENEFITS_GRID_TEXTS.integrations.subtitle}</p>

          <div className="relative -mx-6 -mb-6 mt-auto grid grid-cols-3 place-content-center rounded-t-none border-t-2 border-zinc-900 pb-2">
            <div className="grid w-full place-content-center border-r-2 border-zinc-900 bg-[#627EEA] py-4 sm:py-6 text-white h-12 sm:h-16">
              <SiEthereum className="text-2xl sm:text-3xl" />
            </div>
            <div className="grid w-full place-content-center border-r-2 border-zinc-900 bg-[#F7931A] py-4 sm:py-6 text-white h-12 sm:h-16">
              <SiBitcoin className="text-2xl sm:text-3xl" />
            </div>
            <div className="grid w-full place-content-center bg-[#14F195] py-4 sm:py-6 text-black h-12 sm:h-16">
              <SiSolana className="text-2xl sm:text-3xl" />
            </div>

            <div className="grid w-full place-content-center border-t-2 border-r-2 border-zinc-900 bg-[#6fbcf0] py-4 sm:py-6 text-white h-12 sm:h-16">
              <NetworkSui className="text-2xl sm:text-3xl" size={32} variant="branded" />
            </div>
            <div className="grid w-full place-content-center border-t-2 border-r-2 border-zinc-900 bg-[#e0e0e0] py-4 sm:py-6 text-black h-12 sm:h-16">
              <NetworkAptos className="text-2xl sm:text-3xl" size={32} variant="branded" />
            </div>
            <div className="grid w-full place-content-center border-t-2 border-r-2 border-zinc-900 bg-zinc-50 py-4 sm:py-6 text-white h-12 sm:h-16">
              <NetworkBase className="text-2xl sm:text-3xl" size={32} variant="branded" />
            </div>


            <div className="grid w-full place-content-center border-r-2 border-t-2 border-zinc-900 bg-[#8247E5] py-4 sm:py-6 text-white h-12 sm:h-16">
              <SiPolygon className="text-2xl sm:text-3xl" />
            </div>
            <div className="grid w-full place-content-center border-r-2 border-t-2 border-zinc-900 bg-[#F3BA2F] py-4 sm:py-6 text-white h-12 sm:h-16">
              <SiBinance className="text-2xl sm:text-3xl" />
            </div>
            <div className="grid w-full place-content-center border-t-2 border-zinc-900 bg-white py-4 sm:py-6 h-12 sm:h-16 text-xs sm:text-base">
              {BENEFITS_GRID_TEXTS.integrations.more}
            </div>
          </div>
        </motion.div>

        {/* Security Governance Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 lg:row-span-2 rounded-lg border-2 border-zinc-900 bg-white p-4 overflow-hidden"
        >
          <div className="flex flex-col justify-between gap-4">
            <div className="relative -mx-6 -mt-6 grid place-content-center overflow-hidden border-b-2 border-zinc-900 bg-white shadow-inner shadow-zinc-500 hidden sm:block">

              <Image
                src={BENEFITS_GRID_TEXTS.securityGovernance.imageSrc}
                alt={BENEFITS_GRID_TEXTS.securityGovernance.imageAlt}
                width={600}
                height={800}
                className="mx-auto h-full p-1"
              />
            </div>
            <div>
              <FiShield className="text-3xl sm:text-5xl text-green-500 mb-2" />
              <p className="text-base sm:text-xl font-medium">{BENEFITS_GRID_TEXTS.securityGovernance.title}</p>
              <p className="mt-1 text-xs sm:text-base">{BENEFITS_GRID_TEXTS.securityGovernance.subtitle}</p>
            </div>
          </div>
        </motion.div>

        {/* Usage Based Pricing Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 overflow-hidden space-y-1 flex flex-col"
        >

          <div className="flex h-full flex-col justify-between gap-4">
            <div className="relative -mx-6 -mt-6 grid h-full place-content-center overflow-hidden border-b-2 border-zinc-900 bg-white shadow-inner shadow-zinc-500 hidden sm:block">
              <Image
                src={BENEFITS_GRID_TEXTS.usageBasedPricing.imageSrc}
                alt={BENEFITS_GRID_TEXTS.usageBasedPricing.imageAlt}
                width={600}
                height={800}
                className="mx-auto h-48 sm:h-52 p-4 object-contain"
              />
            </div>
            <div>
              <FiDollarSign className="text-3xl sm:text-5xl text-blue-500 mb-2 block sm:hidden" />
              <p className="text-base sm:text-xl font-medium">{BENEFITS_GRID_TEXTS.usageBasedPricing.title}</p>
              <p className="mt-1 text-xs sm:text-base">{BENEFITS_GRID_TEXTS.usageBasedPricing.subtitle}</p>
            </div>
          </div>
        </motion.div>

        {/* No Setup Cost Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 lg:row-span-2 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 overflow-hidden"
        >
          <div className="flex h-full flex-col justify-between gap-6">
            <div className="relative -mx-6 -mt-6 grid h-full place-content-center overflow-hidden border-b-2 border-zinc-900 bg-white shadow-inner shadow-zinc-500 hidden sm:block">
              <Image
                src={BENEFITS_GRID_TEXTS.noSetupCost.imageSrc}
                alt={BENEFITS_GRID_TEXTS.noSetupCost.imageAlt}
                width={600}
                height={600}
                className="mx-auto h-276px sm:h-62 p-4 object-contain"
              />
            </div>
            <div>
              <FiPackage className="text-3xl sm:text-5xl text-purple-500 mb-2 block sm:hidden" />
              <p className="text-lg sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.noSetupCost.title}</p>
              <p className="mt-1.5 text-xs sm:text-base">{BENEFITS_GRID_TEXTS.noSetupCost.subtitle}</p>
            </div>
          </div>
        </motion.div>

        {/* User Sovereignty Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 space-y-1.5 flex flex-col"
        >
          <FiUserCheck className="text-xl sm:text-3xl text-blue-500" />
          <p className="text-base sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.userSovereignty.title}</p>
          <p className="mt-1.5 flex-grow text-xs sm:text-base">{BENEFITS_GRID_TEXTS.userSovereignty.subtitle}</p>
        </motion.div>

        {/* Brand Control Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 space-y-1.5 flex flex-col"
        >
          <FiAward className="text-xl sm:text-3xl text-pink-500" />
          <p className="text-base sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.brandControl.title}</p>
          <p className="mt-1.5 flex-grow text-xs sm:text-base">{BENEFITS_GRID_TEXTS.brandControl.subtitle}</p>
        </motion.div>

        {/* Expanded User Base Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 space-y-1.5 flex flex-col"
        >
          <FiUsers className="text-xl sm:text-3xl text-zinc-500" />
          <p className="text-base sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.expandedUserBase.title}</p>
          <p className="mt-1.5 flex-grow text-xs sm:text-base">{BENEFITS_GRID_TEXTS.expandedUserBase.subtitle}</p>
        </motion.div>

        {/* Enhanced Functionality Block */}
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 space-y-1.5 flex flex-col"
        >
          <FiZap className="text-xl sm:text-3xl text-orange-500" />
          <p className="text-base sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.enhancedFunctionality.title}</p>
          <p className="mt-1.5 flex-grow text-xs sm:text-base">{BENEFITS_GRID_TEXTS.enhancedFunctionality.subtitle}</p>
        </motion.div>
        <motion.div
          variants={{
            initial: {
              y: 6,
              boxShadow: "0px 0px 0px rgb(24, 24, 27)",
            },
            whileInView: {
              y: 0,
              boxShadow: "0px 6px 0px rgb(24, 24, 27)",
            },
          }}
          className="col-span-1 sm:col-span-1 row-span-1 h-full rounded-lg border-2 border-zinc-900 bg-white p-4 space-y-1.5 flex flex-col"
        >
          <FiActivity className="text-xl sm:text-3xl text-purple-500" />
          <p className="text-base sm:text-2xl font-medium">{BENEFITS_GRID_TEXTS.onChainAnalytics.title}</p>
          <p className="mt-1.5 flex-grow text-xs sm:text-base">{BENEFITS_GRID_TEXTS.onChainAnalytics.subtitle}</p>
        </motion.div>
      </div>
    </motion.section>
  );
};

export default BenefitsGrid;
