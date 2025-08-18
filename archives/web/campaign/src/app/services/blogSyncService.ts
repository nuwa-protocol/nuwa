import fs from 'fs';
import path from 'path';
import { upsertKnowledgeEmbedding, deleteKnowledgeEmbedding, getAllBlogRecords } from './vectorStore';
import matter from 'gray-matter';
import { glob } from 'glob';
import crypto from 'crypto';

// Blog record interface, compatible with KnowledgeRecord
interface BlogRecord {
  airtableId: string;  // Unique ID generated from file path
  key: string;         // File path as unique key
  title: string;
  content: string;
  description: string;
  last_modified_time: string;
  content_hash: string; // Hash of the content for change detection
  tags: string[];
}

/**
 * Generate a unique ID from file path
 * @param filePath File path
 * @returns MD5 hash-based unique ID
 */
function generateUniqueId(filePath: string): string {
  // Only use the filename, not the full path, to ensure the same ID in different environments
  const filename = path.basename(filePath);
  
  // Use the filename with a blog: prefix to generate a hash
  return crypto.createHash('md5').update(`blog:${filename}`).digest('hex');
}

/**
 * Calculate content hash for a blog post
 * @param title Blog title
 * @param content Blog content
 * @param description Blog description
 * @param tags Blog tags
 * @returns MD5 hash of the content
 */
function calculateContentHash(title: string, content: string, description: string, tags: string[]): string {
  // 与 vectorStore.ts 保持一致的哈希计算方式
  const baseText = [
    title || '',
    description || '',
    tags.join(' ') || '',
  ].filter(Boolean).join('\n\n');
  
  return crypto.createHash('md5').update(baseText + content).digest('hex');
}

/**
 * Parse MDX file content, extract frontmatter and content
 * @param filePath MDX file path
 * @returns Parsed blog record
 */
function parseMdxFile(filePath: string): BlogRecord | null {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    
    // Get file stats for last modified time
    const stats = fs.statSync(filePath);
    
    // Extract tags from frontmatter
    const tags = Array.isArray(data.tag) 
      ? data.tag 
      : (data.tag ? [data.tag] : []);
    
    const title = data.title || path.basename(filePath, path.extname(filePath));
    const description = data.excerpt || '';
    
    // Calculate content hash for change detection
    const contentHash = calculateContentHash(title, content, description, tags);
    
    return {
      airtableId: generateUniqueId(filePath),
      key: filePath,
      title,
      content,
      description,
      last_modified_time: stats.mtime.toISOString(),
      content_hash: contentHash,
      tags,
    };
  } catch (error) {
    console.error(`Error parsing MDX file ${filePath}:`, error);
    return null;
  }
}

/**
 * Get all blog post file paths
 * @param contentDir Content directory path
 * @returns Array of blog post file paths
 */
function getBlogFilePaths(contentDir: string): string[] {
  const pattern = path.join(contentDir, '**/*.mdx');
  return glob.sync(pattern, { });
}

/**
 * Sync a single blog post to vector database
 * @param record Blog record
 * @returns Success status
 */
async function syncBlogRecord(record: BlogRecord): Promise<boolean> {
  try {
    // 删除之前的所有记录（包括主记录和分块），确保干净同步
    await deleteKnowledgeEmbedding(record.airtableId);
    
    // 使用修改后的 upsertKnowledgeEmbedding 函数，它会自动处理分块
    const success = await upsertKnowledgeEmbedding(record);
    
    if (success) {
      console.log(`Successfully synced blog: ${record.title} (may include chunks)`);
      return true;
    } else {
      console.error(`Failed to sync blog: ${record.title}`);
      return false;
    }
  } catch (error) {
    console.error(`Error syncing blog ${record.title}:`, error);
    return false;
  }
}

/**
 * Determines if a blog file needs to be synced based on content hash
 * @param record Blog record 
 * @param existingRecords Map of existing record IDs to content hashes
 * @returns True if the record needs syncing
 */
function needsSync(record: BlogRecord, existingRecords: Map<string, string>): boolean {
  // 检查主记录是否存在 - getAllBlogRecords 已经修改为只返回非分块记录
  if (!existingRecords.has(record.airtableId)) {
    console.log(`Blog "${record.title}" is new, needs sync (ID not found in database)`);
    return true;
  }
  
  // 获取现有的内容哈希
  const existingHash = existingRecords.get(record.airtableId) || '';
  const currentHash = record.content_hash;
  
  // 如果内容已更改，则需要同步（包括重新分块）
  const needsUpdate = existingHash !== currentHash;
  
  if (needsUpdate) {
    console.log(`Blog "${record.title}" content has changed, needs sync (including rechunking if needed)`);
    console.log(`- DB hash: ${existingHash.substring(0, 8)}...`);
    console.log(`- New hash: ${currentHash.substring(0, 8)}...`);
  } else {
    console.log(`Blog "${record.title}" content unchanged, no sync needed`);
  }
  
  return needsUpdate;
}

/**
 * Sync all blog posts to vector database
 * @param contentDir Blog content directory
 * @param forceSync Force sync all files regardless of content hash
 * @returns Number of successfully synced posts
 */
export async function syncAllBlogPosts(
  contentDir: string = path.join(process.cwd(), 'website/landing/src/content/blog'),
  forceSync: boolean = false
): Promise<number> {
  try {
    const blogFilePaths = getBlogFilePaths(contentDir);
    console.log(`Found ${blogFilePaths.length} blog files to process`);
    
    if (blogFilePaths.length === 0) {
      return 0;
    }

    // 获取现有记录用于增量同步 - 现在只包含非分块记录
    let existingRecords = new Map<string, string>();
    if (!forceSync) {
      existingRecords = await getAllBlogRecords();
      console.log(`Retrieved ${existingRecords.size} existing non-chunked knowledge records from database for comparison`);
    } else {
      console.log('Force sync enabled, skipping existing records check');
    }
    
    let successCount = 0;
    let skippedCount = 0;
    let totalCount = 0;

    for (const filePath of blogFilePaths) {
      totalCount++;
      const record = parseMdxFile(filePath);
      
      if (!record) {
        console.error(`Could not parse file: ${filePath}`);
        continue;
      }
      
      console.log(`Processing blog #${totalCount}: ${record.title} (ID: ${record.airtableId})`);
      
      // 检查此文件是否需要同步
      if (forceSync || needsSync(record, existingRecords)) {
        const success = await syncBlogRecord(record);
        if (success) {
          successCount++;
        }
      } else {
        console.log(`Skipping unchanged blog: ${record.title}`);
        skippedCount++;
      }
    }

    console.log(`Sync summary: ${successCount} synced, ${skippedCount} skipped, ${totalCount} total blog posts`);
    return successCount;
  } catch (error) {
    console.error('Error in syncAllBlogPosts:', error);
    return 0;
  }
}

/**
 * Delete a blog post from vector database
 * @param filePath Blog file path
 * @returns Success status
 */
export async function deleteBlogPost(filePath: string): Promise<boolean> {
  try {
    const uniqueId = generateUniqueId(filePath);
    // deleteKnowledgeEmbedding 已修改为同时删除所有相关分块
    const success = await deleteKnowledgeEmbedding(uniqueId);
    
    if (success) {
      console.log(`Successfully deleted blog and all its chunks: ${filePath}`);
      return true;
    } else {
      console.error(`Failed to delete blog: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`Error deleting blog ${filePath}:`, error);
    return false;
  }
}