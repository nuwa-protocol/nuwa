import { NextApiRequest, NextApiResponse } from 'next';
import { getAllBlogPosts } from '@/lib/blog';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const posts = getAllBlogPosts();
        res.status(200).json(posts);
    } catch (error) {
        console.error('Error fetching blog posts:', error);
        res.status(500).json({ message: 'Error fetching blog posts' });
    }
} 