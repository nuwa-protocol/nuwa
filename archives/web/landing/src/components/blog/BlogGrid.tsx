import { Post } from "./Post";

interface BlogPost {
    slug: string;
    title: string;
    date: string;
    author: string;
    excerpt: string;
    coverImage: string;
    tag: string;
}

interface BlogGridProps {
    posts: BlogPost[];
}

const BlogGrid = ({ posts }: BlogGridProps) => {
    return (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
                <div key={post.slug}>
                    <Post
                        imgUrl={post.coverImage}
                        tag={post.tag}
                        title={post.title}
                        description={post.excerpt}
                        slug={post.slug}
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                        {new Date(post.date).toLocaleDateString()} • {post.author}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default BlogGrid; 