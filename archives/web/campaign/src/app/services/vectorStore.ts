import { SupabaseClient } from '@supabase/supabase-js';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { KnowledgeRecord } from './airtable';
import { createServiceClient } from './supabase';
import crypto from 'crypto';

let supabaseClient: SupabaseClient | null = null;

async function getSupabase(): Promise<SupabaseClient> {
  if (supabaseClient) {
    return supabaseClient;
  }
  
  try {
    supabaseClient = await createServiceClient();
    return supabaseClient;
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    throw new Error('Failed to initialize Supabase client. Please check your environment variables.');
  }
}

// Interface for the knowledge_embeddings table
interface KnowledgeEmbedding {
  id: string;
  airtable_id: string;
  title: string;
  content: string;
  description: string;
  embedding: number[];
  tags: string[];
  last_modified_time: string;
  content_hash?: string;  // New field to store content hash
  created_at?: string;
  updated_at?: string;
  // 新增分块相关字段
  chunk_index?: number;
  parent_id?: string;
  is_chunk?: boolean;
}

// Extended interface including similarity field for search results
export interface KnowledgeEmbeddingWithSimilarity extends Omit<KnowledgeEmbedding, 'embedding'> {
  similarity: number;
}

// 文本分块配置
const CHUNK_CONFIG = {
  MAX_CHUNK_SIZE: 1000,        // 每个分块的最大字符数
  CHUNK_OVERLAP: 100,          // 分块之间的重叠字符数
  MIN_CHUNK_SIZE: 100,         // 最小分块大小
  ENABLE_CHUNKING: true,       // 是否启用分块功能
};

/**
 * 将长文本分割成小块
 * @param text 要分块的文本
 * @returns 分块后的文本数组
 */
function chunkText(text: string): string[] {
  if (!text || text.length <= CHUNK_CONFIG.MAX_CHUNK_SIZE || !CHUNK_CONFIG.ENABLE_CHUNKING) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    // 计算当前块的结束位置
    let end = start + CHUNK_CONFIG.MAX_CHUNK_SIZE;
    
    // 如果不是最后一块，尝试在句子或段落边界切分
    if (end < text.length) {
      // 尝试在段落处分割
      const paragraphEnd = text.lastIndexOf('\n\n', end);
      if (paragraphEnd > start && paragraphEnd > end - CHUNK_CONFIG.MAX_CHUNK_SIZE / 2) {
        end = paragraphEnd + 2; // 包含换行符
      } else {
        // 尝试在句子处分割
        const sentenceEnd = Math.max(
          text.lastIndexOf('. ', end),
          text.lastIndexOf('。', end),
          text.lastIndexOf('! ', end),
          text.lastIndexOf('？', end),
          text.lastIndexOf('? ', end)
        );
        
        if (sentenceEnd > start && sentenceEnd > end - CHUNK_CONFIG.MAX_CHUNK_SIZE / 2) {
          end = sentenceEnd + 1;
        }
      }
    }
    
    // 添加当前块
    chunks.push(text.slice(start, Math.min(end, text.length)));
    
    // 计算下一块的起始位置，考虑重叠
    start = Math.max(start, end - CHUNK_CONFIG.CHUNK_OVERLAP);
  }

  // 过滤掉过小的块
  return chunks.filter(chunk => chunk.length >= CHUNK_CONFIG.MIN_CHUNK_SIZE);
}

/**
 * Generate embedding vector for text content
 * @param text The text content to embed
 * @returns Embedding vector
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim() === '') {
    console.warn('text is empty');
    return [];
  }
  try {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text
    });

    return embedding;
  } catch (error) {
    console.error('Error generating embedding for text snippet:', text.slice(0, 50), 'Error:', error);
    throw error;
  }
}

/**
 * Create or update knowledge embedding
 * @param record Airtable knowledge record
 * @returns Returns true if successful, false if failed
 */
export async function upsertKnowledgeEmbedding(record: KnowledgeRecord): Promise<boolean> {
  try {
    if (!record.key || !record.content) {
      console.error('Missing required fields for embedding:', record.airtableId);
      return false;
    }

    // 准备用于嵌入的文本
    const baseTextToEmbed = [
      record.title || '',
      record.description || '',
      record.tags?.join(' ') || '',
    ].filter(Boolean).join('\n\n');

    // 计算内容哈希值用于变更检测
    const contentHash = crypto.createHash('md5').update(baseTextToEmbed + record.content).digest('hex');
    
    // 获取Supabase客户端
    const supabase = await getSupabase();

    // 将内容分块
    const contentChunks = chunkText(record.content);
    console.log(`Splitting content into ${contentChunks.length} chunks for record: ${record.airtableId}`);

    // 如果只有一个块，直接存储为单个记录（不启用分块）
    if (contentChunks.length === 1) {
      const textToEmbed = baseTextToEmbed + '\n\n' + contentChunks[0];
      const embedding = await generateEmbedding(textToEmbed);

      // 准备记录以插入数据库
      const embeddingRecord: Omit<KnowledgeEmbedding, 'id' | 'created_at' | 'updated_at'> = {
        airtable_id: record.airtableId,
        title: record.title || '',
        content: record.content || '',
        description: record.description || '',
        embedding,
        tags: record.tags || [],
        last_modified_time: record.last_modified_time || new Date().toISOString(),
        content_hash: contentHash,
        chunk_index: 0,
        is_chunk: false,
      };

      // 插入或更新记录
      const { error } = await supabase
        .from('knowledge_embeddings')
        .upsert(
          { 
            ...embeddingRecord,
            updated_at: new Date().toISOString(),
          },
          { 
            onConflict: 'airtable_id,chunk_index',
            ignoreDuplicates: false,
          }
        );

      if (error) {
        console.error('Error upserting knowledge embedding:', error);
        return false;
      }
    } else {
      // 处理多个块的情况

      // 先删除所有与此记录相关的分块
      await supabase
        .from('knowledge_embeddings')
        .delete()
        .eq('parent_id', record.airtableId);

      // 删除现有的主记录（如果有的话）
      await supabase
        .from('knowledge_embeddings')
        .delete()
        .eq('airtable_id', record.airtableId);

      // 创建主记录（包含标题和描述，但只有部分内容的摘要）
      // 计算摘要内容（取前200个字符）
      const summaryContent = record.content.slice(0, 200) + (record.content.length > 200 ? '...' : '');
      const mainTextToEmbed = baseTextToEmbed + '\n\n' + summaryContent;
      const mainEmbedding = await generateEmbedding(mainTextToEmbed);

      // 准备主记录
      const mainRecord: Omit<KnowledgeEmbedding, 'id' | 'created_at' | 'updated_at'> = {
        airtable_id: record.airtableId,
        title: record.title || '',
        content: summaryContent,
        description: record.description || '',
        embedding: mainEmbedding,
        tags: record.tags || [],
        last_modified_time: record.last_modified_time || new Date().toISOString(),
        content_hash: contentHash,
        chunk_index: 0,
        is_chunk: false,
      };

      // 插入主记录
      const { error: mainError } = await supabase
        .from('knowledge_embeddings')
        .upsert(
          { 
            ...mainRecord,
            updated_at: new Date().toISOString(),
          },
          { 
            onConflict: 'airtable_id,chunk_index',
            ignoreDuplicates: false,
          }
        );

      if (mainError) {
        console.error('Error upserting main knowledge embedding:', mainError);
        return false;
      }

      // 插入所有分块
      for (let i = 0; i < contentChunks.length; i++) {
        const chunkText = contentChunks[i];
        
        // 为分块创建嵌入向量
        // 对于块，我们保留一些元数据以保持上下文
        const chunkTextToEmbed = [
          `${record.title || ''} (Part ${i+1}/${contentChunks.length})`,
          record.description || '',
          chunkText,
          record.tags?.join(' ') || '',
        ].filter(Boolean).join('\n\n');
        
        const chunkEmbedding = await generateEmbedding(chunkTextToEmbed);
        
        // 构建分块记录
        const chunkRecord: Omit<KnowledgeEmbedding, 'id' | 'created_at' | 'updated_at'> = {
          airtable_id: `${record.airtableId}-chunk-${i}`,
          parent_id: record.airtableId,
          title: `${record.title || ''} (Part ${i+1}/${contentChunks.length})`,
          content: chunkText,
          description: record.description || '',
          embedding: chunkEmbedding,
          tags: record.tags || [],
          last_modified_time: record.last_modified_time || new Date().toISOString(),
          content_hash: contentHash,
          chunk_index: i + 1,  // 从1开始，0保留给主记录
          is_chunk: true,
        };
        
        // 插入分块记录
        const { error: chunkError } = await supabase
          .from('knowledge_embeddings')
          .upsert(
            { 
              ...chunkRecord,
              updated_at: new Date().toISOString(),
            },
            { 
              onConflict: 'airtable_id,chunk_index',
              ignoreDuplicates: false,
            }
          );
        
        if (chunkError) {
          console.error(`Error upserting chunk ${i} for record ${record.airtableId}:`, chunkError);
          return false;
        }
      }
    }

    console.log(`Successfully upserted embedding for record: ${record.airtableId} (content hash: ${contentHash})`);
    return true;
  } catch (error) {
    console.error('Error in upsertKnowledgeEmbedding:', error);
    return false;
  }
}

/**
 * Search for relevant knowledge embeddings
 * @param query User query
 * @param limit Maximum number of results to return
 * @param similarityThreshold Minimum similarity threshold
 * @returns Array of relevant knowledge records
 */
export async function searchKnowledgeEmbeddings(
  query: string,
  limit: number = 3,
  similarityThreshold: number = 0.75
): Promise<KnowledgeEmbeddingWithSimilarity[]> {
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    
    const supabase = await getSupabase();
    
    // 增加搜索限制，以便包含更多分块结果
    const internalLimit = limit * 3;
    
    // Perform vector similarity search
    const { data, error } = await supabase
      .rpc('match_knowledge_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: similarityThreshold,
        match_count: internalLimit
      });

    if (error) {
      console.error('Error searching knowledge embeddings:', error);
      return [];
    }

    // 将分块结果按照父ID分组，只保留相似度最高的分块
    const groupedResults = new Map<string, KnowledgeEmbeddingWithSimilarity>();
    
    // 处理结果，优先保留非分块结果和高相似度的分块
    for (const item of data) {
      const resultItem: KnowledgeEmbeddingWithSimilarity = {
        id: item.id,
        airtable_id: item.airtable_id,
        title: item.title,
        content: item.content,
        description: item.description,
        tags: item.tags,
        last_modified_time: item.last_modified_time,
        created_at: item.created_at,
        updated_at: item.updated_at,
        similarity: item.similarity,
        chunk_index: item.chunk_index || 0,
        parent_id: item.parent_id,
        is_chunk: item.is_chunk
      };

      // 如果是分块
      if (item.is_chunk && item.parent_id) {
        // 检查父ID是否已存在于结果中，如果存在且当前相似度更高，则替换
        if (!groupedResults.has(item.parent_id) || 
            groupedResults.get(item.parent_id)!.similarity < item.similarity) {
          groupedResults.set(item.parent_id, resultItem);
        }
      } else {
        // 如果不是分块，使用自己的ID作为键
        if (!groupedResults.has(item.airtable_id) || 
            groupedResults.get(item.airtable_id)!.similarity < item.similarity) {
          groupedResults.set(item.airtable_id, resultItem);
        }
      }
    }

    // 转换回数组并按相似度排序
    const finalResults = Array.from(groupedResults.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return finalResults;
  } catch (error) {
    console.error('Error in searchKnowledgeEmbeddings:', error);
    return [];
  }
}

/**
 * Delete knowledge embedding
 * @param airtableId Airtable record ID
 * @returns Returns true if successful, false if failed
 */
export async function deleteKnowledgeEmbedding(airtableId: string): Promise<boolean> {
  try {
    const supabase = await getSupabase();
    
    // 首先删除所有相关的分块
    const { error: chunkError } = await supabase
      .from('knowledge_embeddings')
      .delete()
      .eq('parent_id', airtableId);
    
    if (chunkError) {
      console.error('Error deleting knowledge embedding chunks:', chunkError);
    }
    
    // 然后删除主记录
    const { error } = await supabase
      .from('knowledge_embeddings')
      .delete()
      .eq('airtable_id', airtableId);

    if (error) {
      console.error('Error deleting knowledge embedding:', error);
      return false;
    }

    console.log(`Successfully deleted embedding for record: ${airtableId}`);
    return true;
  } catch (error) {
    console.error('Error in deleteKnowledgeEmbedding:', error);
    return false;
  }
}

/**
 * Get embedding count
 * @returns Number of embedding records
 */
export async function getEmbeddingCount(): Promise<number> {
  try {
    const supabase = await getSupabase();
    
    // 修改计数方法，只计算非分块记录
    const { count, error } = await supabase
      .from('knowledge_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('is_chunk', false);

    if (error) {
      console.error('Error getting embedding count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getEmbeddingCount:', error);
    return 0;
  }
}

/**
 * Get all blog posts in the vector database
 * @returns Map of airtable_id to content hash
 */
export async function getAllBlogRecords(): Promise<Map<string, string>> {
  try {
    console.log('Fetching all blog records from vector database...');
    const supabase = await getSupabase();
    
    // 修改查询，只获取非分块记录
    const { data, error } = await supabase
      .from('knowledge_embeddings')
      .select('airtable_id, content_hash, last_modified_time')
      .is('is_chunk', false);
    
    if (error) {
      console.error('Error fetching knowledge records:', error);
      return new Map();
    }
    
    // Create a map of ID to content_hash for quick lookup
    const recordsMap = new Map<string, string>();
    
    if (!data || data.length === 0) {
      console.log('No existing records found in database');
      return recordsMap;
    }
    
    // Debug: Show the total number of knowledge records found
    console.log(`Found ${data.length} total knowledge records`);
    
    // Process the returned records
    data.forEach(record => {
      if (record.airtable_id) {
        // Prefer content_hash if available, otherwise fall back to last_modified_time
        const value = record.content_hash || record.last_modified_time;
        recordsMap.set(record.airtable_id, value);
      } else {
        console.warn('Found record with missing airtable_id:', record);
      }
    });
    
    // Debug information about what we found
    console.log(`Created map with ${recordsMap.size} knowledge records for comparison`);
    
    // Print some example records for verification (limit to 3)
    const examples = Array.from(recordsMap.entries()).slice(0, 3);
    if (examples.length > 0) {
      console.log('Sample records:');
      examples.forEach(([id, hash]) => {
        console.log(`- ID: ${id}, Hash/Modified: ${hash}`);
      });
    }
    
    return recordsMap;
  } catch (error) {
    console.error('Error in getAllBlogRecords:', error);
    return new Map();
  }
}

/**
 * Enhanced search for knowledge embeddings with cross-language support
 * This function provides better support for searching English content with Chinese queries
 * @param query User query
 * @param limit Maximum number of results to return
 * @param similarityThreshold Minimum similarity threshold
 * @returns Array of relevant knowledge records
 */
export async function enhancedSearchKnowledgeEmbeddings(
  query: string,
  limit: number = 3,
  similarityThreshold: number = 0.6 // Lower default threshold for cross-language queries
): Promise<KnowledgeEmbeddingWithSimilarity[]> {
  try {
    // Check if query is in Chinese (simplified or traditional)
    const containsChinese = /[\u4e00-\u9fff]/.test(query);
    
    let results: KnowledgeEmbeddingWithSimilarity[] = [];
    
    // If query contains Chinese, try multiple search strategies
    if (containsChinese) {
      // Strategy 1: Try with original query but lower threshold
      const originalResults = await searchKnowledgeEmbeddings(
        query, 
        limit, 
        similarityThreshold
      );
      
      results = [...originalResults];
      
      // Extract non-Chinese terms (like "Prompt is law") which might be product names
      const nonChineseTerms = query.match(/[a-zA-Z][a-zA-Z\s]+[a-zA-Z]/g) || [];
      
      // Strategy 2: Search with extracted English terms if available
      const termPromises = nonChineseTerms
        .filter(term => term.trim().length > 2) // Only meaningful terms
        .map(term => searchKnowledgeEmbeddings(
          term.trim(),
          limit,
          similarityThreshold
        ));
      
      const termResultsArray = await Promise.all(termPromises);
      
      // Merge results, avoiding duplicates
      for (const termResults of termResultsArray) {
        for (const result of termResults) {
          if (!results.some(r => r.airtable_id === result.airtable_id)) {
            results.push(result);
          }
        }
      }
      
      // Sort results by similarity
      results.sort((a, b) => b.similarity - a.similarity);
      
      // Limit to requested number
      if (results.length > limit) {
        results = results.slice(0, limit);
      }
    } else {
      // For non-Chinese queries, use the standard search
      results = await searchKnowledgeEmbeddings(query, limit, similarityThreshold);
    }
    
    return results;
  } catch (error) {
    console.error('Error in enhancedSearchKnowledgeEmbeddings:', error);
    return [];
  }
}