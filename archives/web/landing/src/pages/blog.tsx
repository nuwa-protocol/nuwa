import { ExpandableNavBar } from "@/components/navigation/ExpandableNavBar";
import { NAV_LINKS } from "@/components/navigation/DesktopLinks";
import Footer from "@/components/footer/Footer";
import { font } from "@/fonts";
import { getAllBlogPosts, getAllTags } from "@/lib/blog";
import { GetStaticProps } from "next";
import { useState, Suspense, lazy } from "react";
import SEO from "@/components/SEO";

// 懒加载非首屏组件
const LazyBlogFilter = lazy(() => import("@/components/blog/BlogFilter"));
const LazyBlogGrid = lazy(() => import("@/components/blog/BlogGrid"));

interface BlogPageProps {
    posts: {
        slug: string;
        title: string;
        date: string;
        author: string;
        excerpt: string;
        coverImage: string;
        tag: string;
    }[];
    tags: string[];
}

export default function Blog({ posts: initialPosts, tags }: BlogPageProps) {
    const [filteredPosts, setFilteredPosts] = useState(initialPosts);

    // 获取最新的5个标签作为关键词
    const recentTags = tags.slice(0, 5).join(', ');

    return (
        <>
            <SEO
                title="Blog - Latest Web3 Agent Development Insights"
                description="Explore the latest insights, tutorials, and updates about Web3 Agent development, AI automation, and blockchain technology integration."
                keywords={`Web3 Blog, AI Agents, Blockchain Development, Smart Contract Automation, ${recentTags}`}
                ogImage="/hero-background.png"
            />
            <main className={`${font.className} overflow-hidden`}>
                <ExpandableNavBar links={NAV_LINKS} />
                <div className="bg-zinc-50 py-16 md:py-24">
                    <div className="mx-auto max-w-6xl px-4">
                        <h1 className="mb-8 text-4xl font-bold md:text-5xl">Nuwa Blog</h1>
                        <p className="mb-12 text-lg text-zinc-600">
                            Explore our latest articles, insights, and updates
                        </p>

                        <Suspense fallback={<div className="h-32 flex items-center justify-center">Loading filters...</div>}>
                            <LazyBlogFilter
                                tags={tags}
                                posts={initialPosts}
                                onFilterChange={setFilteredPosts}
                            />
                        </Suspense>

                        <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading posts...</div>}>
                            <LazyBlogGrid posts={filteredPosts} />
                        </Suspense>
                    </div>
                </div>
                <Suspense fallback={<div className="h-32 flex items-center justify-center">Loading footer...</div>}>
                    <Footer />
                </Suspense>
            </main>
        </>
    );
}

export const getStaticProps: GetStaticProps<BlogPageProps> = async () => {
    const posts = getAllBlogPosts();
    const tags = getAllTags();

    return {
        props: {
            posts,
            tags,
        },
        // 添加 ISR 以定期重新生成页面
        revalidate: 3600, // 每小时重新生成一次
    };
}; 