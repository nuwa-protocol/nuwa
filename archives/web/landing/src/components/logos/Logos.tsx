import React from "react";
import { motion } from "framer-motion";
import {
  ExchangeIcon,
  NetworkIcon,
  TokenIcon,
  WalletIcon,
  tokenIcons
} from "@web3icons/react";

export const Logos = () => {
  return (
    <section className="relative -mt-2 scale-[1.01] border-y-2 border-zinc-900 bg-white">
      <div className="relative z-0 flex overflow-hidden border-b-2 border-zinc-900">
        <TranslateWrapper>
          <LogoItemsTop />
        </TranslateWrapper>
        <TranslateWrapper>
          <LogoItemsTop />
        </TranslateWrapper>
        <TranslateWrapper>
          <LogoItemsTop />
        </TranslateWrapper>
      </div>
      <div className="relative z-0 flex overflow-hidden">
        <TranslateWrapper reverse>
          <LogoItemsBottom />
        </TranslateWrapper>
        <TranslateWrapper reverse>
          <LogoItemsBottom />
        </TranslateWrapper>
        <TranslateWrapper reverse>
          <LogoItemsBottom />
        </TranslateWrapper>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-32 bg-gradient-to-r from-white to-white/0" />
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-32 bg-gradient-to-l from-white to-white/0" />
    </section>
  );
};

const TranslateWrapper = ({
  children,
  reverse,
}: {
  children: React.ReactNode;
  reverse?: boolean;
}) => {
  return (
    <motion.div
      initial={{ translateX: reverse ? "-100%" : "0%" }}
      animate={{ translateX: reverse ? "0%" : "-100%" }}
      transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
      className="flex px-2"
    >
      {children}
    </motion.div>
  );
};

// 自定义 LogoItem 组件，适应 @web3icons/react 库的图标
const LogoItem = ({ Icon, name }: { Icon: React.ComponentType<any>; name: string }) => {
  return (
    <span className="flex items-center justify-center gap-4 px-4 py-2 md:py-4">
      <Icon className="text-2xl text-indigo-600 md:text-3xl" />
      <span className="whitespace-nowrap text-xl font-semibold uppercase md:text-2xl">
        {name}
      </span>
    </span>
  );
};

const LogoItemsTop = () => (
  <>
    <LogoItem Icon={tokenIcons.Token1INCH} name="1inch" />
    <LogoItem Icon={tokenIcons.TokenAAVE} name="Aave" />
    <LogoItem Icon={tokenIcons.TokenUNI} name="Uniswap" />
    <LogoItem Icon={tokenIcons.TokenDAI} name="MakerDAO" />
    <LogoItem Icon={tokenIcons.TokenAPE} name="ApeCoin" />
    <LogoItem Icon={tokenIcons.TokenPEPE} name="Pepe" />
    <LogoItem Icon={tokenIcons.TokenCRV} name="Curve" />
    <LogoItem Icon={tokenIcons.TokenCOMP} name="Compound" />
    <LogoItem Icon={tokenIcons.TokenAXS} name="Axie Infinity" />
    <LogoItem Icon={tokenIcons.TokenAR} name="Arweave" />
  </>
);

const LogoItemsBottom = () => (
  <>
    <LogoItem Icon={tokenIcons.TokenTON} name="Ton" />
    <LogoItem Icon={tokenIcons.TokenBTC} name="Bitcoin" />
    <LogoItem Icon={tokenIcons.TokenDOGE} name="Dogecoin" />
    <LogoItem Icon={tokenIcons.TokenOP} name="Optimism" />
    <LogoItem Icon={tokenIcons.TokenETH} name="Ethereum" />
    <LogoItem Icon={tokenIcons.TokenSUI} name="Sui" />
    <LogoItem Icon={tokenIcons.TokenMATIC} name="Polygon" />
    <LogoItem Icon={tokenIcons.TokenSOL} name="Solana" />
    <LogoItem Icon={tokenIcons.TokenUSDT} name="Tether" />
    <LogoItem Icon={tokenIcons.TokenAPT} name="Aptos" />
  </>
);
