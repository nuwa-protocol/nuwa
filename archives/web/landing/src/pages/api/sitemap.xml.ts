import { NextApiRequest, NextApiResponse } from 'next';
import { getAllBlogPosts } from '@/lib/blog';

const SITE_URL = 'https://nuwa.dev';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Set the content type to XML
    res.setHeader('Content-Type', 'text/xml');

    // Get all blog posts
    const posts = getAllBlogPosts();

    // Create the XML content
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <!-- Static pages -->
      <url>
        <loc>${SITE_URL}</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
      </url>
      <url>
        <loc>${SITE_URL}/blog</loc>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
      </url>

      <!-- Blog posts -->
      ${posts
            .map(
                (post) => `
        <url>
          <loc>${SITE_URL}/blog/${post.slug}</loc>
          <lastmod>${post.date}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>0.6</priority>
        </url>
      `
            )
            .join('')}
    </urlset>`;

    // Send the XML response
    res.write(xml);
    res.end();
} 