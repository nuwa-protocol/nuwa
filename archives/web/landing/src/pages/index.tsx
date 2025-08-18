import { Hero } from "@/components/hero/Hero";
import { Logos } from "@/components/logos/Logos";
import { ExpandableNavBar } from "@/components/navigation/ExpandableNavBar";
import { NAV_LINKS } from "@/components/navigation/DesktopLinks";

import { font } from "@/fonts";

import { getAllBlogPosts } from "@/lib/blog";
import { GetStaticProps } from "next";
import { BlogPost } from "@/lib/blog";
import { motion, useInView } from "framer-motion";
import { useRef, ReactNode, Suspense, lazy } from "react";

import SEO from "@/components/SEO";

// 懒加载非首屏组件
const LazyBenefitsGrid = lazy(() => import("@/components/benefits-grid/BenefitsGrid"));
const LazyBlogCarousel = lazy(() => import("@/components/blog/BlogCarousel"));
const LazyUsecases = lazy(() => import("@/components/usecases/Usecases"));
const LazyFinalCTA = lazy(() => import("@/components/final-cta/FinalCTA"));
const LazyFooter = lazy(() => import("@/components/footer/Footer"));
const LazyFeatureToggles = lazy(() => import("@/components/feature-toggles/FeatureToggles"));

interface HomeProps {
  posts: BlogPost[];
}

// 定义淡入动画变体
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  }
};

// 创建一个可重用的动画组件
const AnimatedSection = ({ children, delay = 0 }: { children: ReactNode, delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
};

export default function Home({ posts }: HomeProps) {
  return (
    <>
      <SEO
        title="Nuwa - Agent-as-a-Service (AaaS) for Web3"
        description="Transform your Web3 offering with AI agents that make complex features accessible to mainstream users while unlocking entirely new capabilities."
        keywords="AI, Web3, Agent-as-a-Service, AaaS, Web3 Agent, Web3 AI, Web3 Development, Web3 Automation"
        ogImage="/og-image.png"
      />
      <main className={`${font.className} overflow-hidden`}>
        <ExpandableNavBar links={NAV_LINKS}>
          <AnimatedSection>
            <Hero />
          </AnimatedSection>
        </ExpandableNavBar>

        <AnimatedSection delay={0.1}>
          <Logos />
        </AnimatedSection>

        <div className="space-y-36 pb-24 pt-24 md:pt-32 px-4">
          <AnimatedSection delay={0.2}>
            <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading...</div>}>
              <LazyFeatureToggles />
            </Suspense>
          </AnimatedSection>

          <AnimatedSection delay={0.3}>
            <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading...</div>}>
              <LazyBenefitsGrid />
            </Suspense>
          </AnimatedSection>

          <AnimatedSection delay={0.4}>
            <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading...</div>}>
              <LazyUsecases />
            </Suspense>
          </AnimatedSection>

          <AnimatedSection delay={0.5}>
            <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading...</div>}>
              <LazyBlogCarousel posts={posts} />
            </Suspense>
          </AnimatedSection>


          <AnimatedSection delay={0.6}>
            <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading...</div>}>
              <LazyFinalCTA />
            </Suspense>
          </AnimatedSection>

          <AnimatedSection delay={0.7}>
            <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading...</div>}>
              <LazyFooter />
            </Suspense>
          </AnimatedSection>
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const posts = getAllBlogPosts();

  return {
    props: {
      posts,
    },
  };
};
