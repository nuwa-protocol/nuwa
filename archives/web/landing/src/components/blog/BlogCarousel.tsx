import { motion } from "framer-motion";
import { useState } from "react";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import useMeasure from "react-use-measure";
import { Post, PostType } from "./Post";
import { BlogPost } from "@/lib/blog";

export const CARD_SIZE = 370; // CARD_WIDTH + MARGIN

export const BREAKPOINTS = {
  sm: 640,
  lg: 1024,
};

const BLOG_CAROUSEL_TEXTS = {
  heading: "Blog Posts",
};

interface BlogCarouselProps {
  posts: BlogPost[];
}

const BlogCarousel = ({ posts }: BlogCarouselProps) => {
  const [ref, { width }] = useMeasure();
  const [offset, setOffset] = useState(0);

  const formattedPosts: PostType[] = posts.map((post, index) => ({
    id: index + 1,
    imgUrl: post.coverImage,
    tag: post.tag,
    title: post.title,
    description: post.excerpt,
    slug: post.slug,
  }));

  const CARD_BUFFER =
    width > BREAKPOINTS.lg ? 3 : width > BREAKPOINTS.sm ? 2 : 1;

  const CAN_SHIFT_LEFT = offset < 0;

  const CAN_SHIFT_RIGHT =
    Math.abs(offset) < CARD_SIZE * (formattedPosts.length - CARD_BUFFER);

  const shiftLeft = () => {
    if (!CAN_SHIFT_LEFT) {
      return;
    }
    setOffset((pv) => (pv += CARD_SIZE));
  };

  const shiftRight = () => {
    if (!CAN_SHIFT_RIGHT) {
      return;
    }
    setOffset((pv) => (pv -= CARD_SIZE));
  };

  return (
    <section ref={ref}>
      <div className="relative overflow-hidden px-2 md:px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-center text-3xl font-medium leading-tight md:text-start md:text-4xl md:leading-tight">
              {BLOG_CAROUSEL_TEXTS.heading}
            </h2>

            <div className="flex items-center gap-2">
              <button
                className={`rounded-md border border-zinc-900 bg-white p-1.5 text-2xl transition-all ${CAN_SHIFT_LEFT ? "hover:bg-zinc-200" : "opacity-30"
                  }`}
                disabled={!CAN_SHIFT_LEFT}
                onClick={shiftLeft}
              >
                <FiArrowLeft />
              </button>
              <button
                className={`rounded-md border border-zinc-900 bg-white p-1.5 text-2xl transition-all ${CAN_SHIFT_RIGHT ? "hover:bg-zinc-200" : "opacity-30"
                  }`}
                disabled={!CAN_SHIFT_RIGHT}
                onClick={shiftRight}
              >
                <FiArrowRight />
              </button>
            </div>
          </div>
          <motion.div
            animate={{
              x: offset,
            }}
            transition={{
              ease: "easeInOut",
            }}
            className="flex"
          >
            {formattedPosts.map((post) => {
              return <Post key={post.id} {...post} />;
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BlogCarousel;
