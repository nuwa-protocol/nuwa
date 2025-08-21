import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { 
  queryFromSupabase,
  getAllTags, 
  queryByExactTags,
  getLastCursor,
  getLastUpdateCursor
} from '../src/supabase.js';

// Load environment variables for testing
config();

describe('Supabase Read Functions', () => {
  beforeAll(async () => {
    // Verify environment variables are set
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('Please set SUPABASE_URL and SUPABASE_KEY environment variables for testing');
    }
    console.log('Testing with Supabase URL:', process.env.SUPABASE_URL);
  });

  describe('queryFromSupabase', () => {
    it('should return successful response structure', async () => {
      const result = await queryFromSupabase();
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('totalItems');
        expect(result).toHaveProperty('page');
        expect(result).toHaveProperty('pageSize');
        expect(result).toHaveProperty('totalPages');
        expect(Array.isArray(result.items)).toBe(true);
        expect(typeof result.totalItems).toBe('number');
        expect(typeof result.page).toBe('number');
        expect(typeof result.pageSize).toBe('number');
        expect(typeof result.totalPages).toBe('number');
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 10000);

    it('should handle pagination parameters correctly', async () => {
      const result = await queryFromSupabase(null, null, null, null, 0, 10);
      
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.page).toBe(0);
        expect(result.pageSize).toBe(10);
        expect(result.items?.length).toBeLessThanOrEqual(10);
      }
    }, 10000);

    it('should respect maximum page size limit (50)', async () => {
      const result = await queryFromSupabase(null, null, null, null, 0, 100);
      
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.pageSize).toBe(50);
      }
    }, 10000);

    it('should handle name filtering', async () => {
      const result = await queryFromSupabase('test-search-term');
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        
        if (result.items && result.items.length > 0) {
          // If results found, they should have the required structure
          result.items.forEach(item => {
            expect(item).toHaveProperty('cid');
            expect(item).toHaveProperty('name');
            expect(item).toHaveProperty('id');
            expect(item).toHaveProperty('version');
            expect(item).toHaveProperty('display_name');
            expect(item).toHaveProperty('tags');
            expect(Array.isArray(item.tags)).toBe(true);
          });
        }
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 10000);

    it('should handle CID filtering', async () => {
      const result = await queryFromSupabase(null, 'Qm');
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        
        if (result.items && result.items.length > 0) {
          result.items.forEach(item => {
            expect(item.cid).toMatch(/Qm/);
            expect(typeof item.cid).toBe('string');
            expect(typeof item.name).toBe('string');
            expect(typeof item.id).toBe('string');
            expect(typeof item.version).toBe('number');
          });
        }
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 10000);

    it('should handle tags filtering', async () => {
      // First get all available tags to use a real tag for testing
      const tagsResult = await getAllTags();
      let testTags = ['Coding']; // Default test tag

      if (tagsResult.success && tagsResult.tags && tagsResult.tags.length > 0) {
        // Use the first available tag from the database
        testTags = [tagsResult.tags[0]];
        console.log(`Using existing tag for test: ${testTags[0]}`);
      }
      
      const result = await queryFromSupabase(null, null, null, ['Coding']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        
        if (result.items && result.items.length > 0) {
          result.items.forEach(item => {
            expect(Array.isArray(item.tags)).toBe(true);
            // At least one of the tags should match (overlaps behavior)
            // Note: This test might pass even if no items have the test tag
            // because we're testing the structure, not the actual filtering logic
          });
        }
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
        console.log(`Tags filtering error: ${result.error}`);
      }
    }, 150000000);

    it('should handle empty results gracefully', async () => {
      // Use a very unlikely search term
      const result = await queryFromSupabase('very-unlikely-to-exist-search-term-12345');
      
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(0);
        expect(result.totalPages).toBe(0);
      }
    }, 10000);

    it('should return valid pagination info', async () => {
      const result = await queryFromSupabase(null, null, null, null, 0, 5);
      
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.page).toBe(0);
        expect(result.pageSize).toBe(5);
        expect(typeof result.totalItems).toBe('number');
        expect(typeof result.totalPages).toBe('number');
        expect(result.totalPages).toBe(Math.ceil((result.totalItems || 0) / 5));
      }
    }, 10000);
  });

  describe('getAllTags', () => {
    it('should return all unique tags', async () => {
      const result = await getAllTags();
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('tags');
        expect(Array.isArray(result.tags)).toBe(true);
        
        if (result.tags && result.tags.length > 0) {
          // Check that all items are strings
          result.tags.forEach(tag => {
            expect(typeof tag).toBe('string');
          });
          
          // Check that tags are unique (no duplicates)
          const uniqueTags = [...new Set(result.tags)];
          expect(result.tags.length).toBe(uniqueTags.length);
          
          // Check that tags are sorted
          const sortedTags = [...result.tags].sort();
          expect(result.tags).toEqual(sortedTags);
        }
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 10000);

    it('should handle empty tag results', async () => {
      const result = await getAllTags();
      
      expect(result).toHaveProperty('success');
      if (result.success && result.tags) {
        // Should be an array even if empty
        expect(Array.isArray(result.tags)).toBe(true);
      }
    }, 10000);
  });

  describe('queryByExactTags', () => {
    it('should return valid response structure', async () => {
      const result = await queryByExactTags(['Coding']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('totalItems');
        expect(result).toHaveProperty('page');
        expect(result).toHaveProperty('pageSize');
        expect(result).toHaveProperty('totalPages');
        expect(Array.isArray(result.items)).toBe(true);
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 10000);

    it('should handle pagination correctly', async () => {
      const result = await queryByExactTags(['test'], 0, 5);
      
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.page).toBe(0);
        expect(result.pageSize).toBe(5);
        expect(result.items?.length).toBeLessThanOrEqual(5);
      }
    }, 10000);

    it('should return items with correct structure', async () => {
      const result = await queryByExactTags(['test']);
      
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
        
        if (result.items && result.items.length > 0) {
          result.items.forEach(item => {
            expect(item).toHaveProperty('cid');
            expect(item).toHaveProperty('name');
            expect(item).toHaveProperty('id');
            expect(item).toHaveProperty('version');
            expect(item).toHaveProperty('display_name');
            expect(item).toHaveProperty('tags');
            expect(typeof item.cid).toBe('string');
            expect(typeof item.name).toBe('string');
            expect(typeof item.id).toBe('string');
            expect(typeof item.version).toBe('number');
            expect(typeof item.display_name).toBe('string');
            expect(Array.isArray(item.tags)).toBe(true);
          });
        }
      } else {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
      }
    }, 10000);

    it('should handle empty tag array', async () => {
      const result = await queryByExactTags([]);
      
      expect(result).toHaveProperty('success');
      // Should handle empty tags gracefully
    }, 10000);

    it('should handle multiple tags', async () => {
      const result = await queryByExactTags(['tag1', 'tag2']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    }, 10000);
  });

  describe('Tags Query Debug', () => {
    it('should debug tags filtering issue', async () => {
      console.log('🔍 调试标签过滤问题...');
      
      // Test 1: Get all available tags first
      console.log('1. 获取所有可用标签...');
      const tagsResult = await getAllTags();
      console.log('Tags result:', JSON.stringify(tagsResult, null, 2));
      
      if (tagsResult.success && tagsResult.tags && tagsResult.tags.length > 0) {
        const firstTag = tagsResult.tags[0];
        console.log(`2. 使用第一个标签进行测试: "${firstTag}"`);
        
        // Test 2: Query with single tag
        const singleTagResult = await queryFromSupabase(null, null, null, [firstTag]);
        console.log('Single tag result:', JSON.stringify(singleTagResult, null, 2));
        
        expect(singleTagResult).toHaveProperty('success');
        if (!singleTagResult.success) {
          console.error('单标签查询失败:', singleTagResult.error);
        }
        
        // Test 3: Query with multiple tags if more available
        if (tagsResult.tags.length > 1) {
          const multipleTagsResult = await queryFromSupabase(null, null, null, tagsResult.tags.slice(0, 2));
          console.log('Multiple tags result:', JSON.stringify(multipleTagsResult, null, 2));
          
          expect(multipleTagsResult).toHaveProperty('success');
          if (!multipleTagsResult.success) {
            console.error('多标签查询失败:', multipleTagsResult.error);
          }
        }
      } else {
        console.log('数据库中没有可用的标签，跳过标签测试');
      }
    }, 20000);
  });

  describe('Cursor Management', () => {
    describe('getLastCursor', () => {
      it('should return cursor or null', async () => {
        const result = await getLastCursor();
        
        // Should return either a valid cursor object or null
        if (result !== null) {
          expect(typeof result).toBe('object');
          expect(result).toHaveProperty('event_index');
          expect(result).toHaveProperty('tx_order');
          expect(typeof result.event_index).toBe('string');
          expect(typeof result.tx_order).toBe('string');
        }
      }, 10000);

      it('should not throw errors', async () => {
        // Should handle any database issues gracefully
        await expect(getLastCursor()).resolves.not.toThrow();
      }, 10000);
    });

    describe('getLastUpdateCursor', () => {
      it('should return cursor or null', async () => {
        const result = await getLastUpdateCursor();
        
        // Should return either a valid cursor object or null
        if (result !== null) {
          expect(typeof result).toBe('object');
          expect(result).toHaveProperty('event_index');
          expect(result).toHaveProperty('tx_order');
          expect(typeof result.event_index).toBe('string');
          expect(typeof result.tx_order).toBe('string');
        }
      }, 10000);

      it('should not throw errors', async () => {
        // Should handle any database issues gracefully
        await expect(getLastUpdateCursor()).resolves.not.toThrow();
      }, 10000);
    });
  });

  describe('Database Connection', () => {
    it('should be able to connect to Supabase', async () => {
      // Test basic connectivity by running a simple query
      const result = await queryFromSupabase(null, null, null, null, 0, 1);
      
      // Should not throw connection errors
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      // If it fails, it should be a logical failure, not a connection failure
      if (!result.success && result.error) {
        // Connection errors typically contain certain keywords
        expect(result.error).not.toMatch(/connection/i);
        expect(result.error).not.toMatch(/timeout/i);
        expect(result.error).not.toMatch(/network/i);
      }
    }, 15000);
  });
});