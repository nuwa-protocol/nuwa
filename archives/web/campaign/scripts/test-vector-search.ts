import { searchKnowledgeEmbeddings, enhancedSearchKnowledgeEmbeddings, KnowledgeEmbeddingWithSimilarity, } from '../src/app/services/vectorStore';

// 用于存储测试开始时间
const testStartTime = Date.now();

interface SearchResult {
  query: string;
  threshold?: number;
  results: KnowledgeEmbeddingWithSimilarity[];
  duration: number;
}

/**
 * Test vector search functionality with various queries
 */
async function testVectorSearch() {
  console.log('=== Testing Vector Search Functionality ===');
  console.log(`🕒 Test started at: ${new Date().toISOString()}`);
  
  // Test queries - include both English and Chinese variants
  const queries = [
    // English queries
    { query: 'What is Prompt is law?', threshold: 0.3, limit: 3 },
    { query: 'Prompt is law', threshold: 0.3, limit: 3 },
    { query: 'Prompt is law', threshold: 0.3, limit: 3 }, // Lower threshold
    
    // Chinese queries
    { query: '什么是 Prompt is law?', threshold: 0.3, limit: 3 },
    { query: '什么是 Prompt is law?', threshold: 0.3, limit: 3 }, // Lower threshold
    { query: 'Prompt is law 是什么?', threshold: 0.3, limit: 3 },
    
    // Additional variations
    { query: 'prompt engineering', threshold: 0.3, limit: 3 },
    { query: '提示工程', threshold: 0.3, limit: 3 },
    
    // 新增测试用例 - 特定领域问题
    { query: 'How to use prompts effectively?', threshold: 0.5, limit: 5 },
    { query: '如何有效地使用提示词？', threshold: 0.5, limit: 5 },
    { query: 'Examples of good prompts', threshold: 0.6, limit: 3 },
    { query: '好的提示词例子', threshold: 0.6, limit: 3 },
    
    // 边缘情况测试
    { query: '', threshold: 0.5, limit: 3 }, // 空查询
    { query: '          ', threshold: 0.5, limit: 3 }, // 只有空格
    { query: 'abcdefghijklmnopqrstuvwxyz', threshold: 0.4, limit: 3 }, // 随机字符
    { query: '!@#$%^&*()', threshold: 0.4, limit: 3 }, // 特殊字符
    
    // 多语言混合查询
    { query: 'Prompt engineering 提示工程 best practices', threshold: 0.5, limit: 3 },
    { query: '如何使用 prompt engineering to improve results', threshold: 0.5, limit: 3 },
  ];
  
  // 存储结果用于比较
  const allResults = {
    standard: [] as SearchResult[],
    enhanced: [] as SearchResult[]
  };
  
  // First test standard search
  console.log('\n🔍 STANDARD SEARCH TEST');
  
  // Run searches for each query
  for (const { query, threshold, limit } of queries) {
    console.log(`\n--- Testing query: "${query}" (threshold: ${threshold}) ---`);
    
    try {
      console.log(`🕒 Search started at: ${new Date().toISOString()}`);
      const startTime = Date.now();
      
      // 记录查询参数
      console.log(`Query parameters: { query: "${query}", threshold: ${threshold}, limit: ${limit} }`);
      
      const results = await searchKnowledgeEmbeddings(query, limit, threshold);
      const duration = Date.now() - startTime;
      // 保存结果用于后续比较
      allResults.standard.push({
        query,
        threshold,
        results,
        duration
      });
      
      if (results.length === 0) {
        console.log(`❌ No results found for query: "${query}" (search took ${duration}ms)`);
      } else {
        console.log(`✅ Found ${results.length} results in ${duration}ms:`);
        
        results.forEach((result, index) => {
          console.log(`\nResult #${index + 1} (similarity: ${(result.similarity * 100).toFixed(2)}%)`);
          console.log(`Title: ${result.title}`);
          console.log(`Description: ${result.description?.substring(0, 100)}${result.description && result.description.length > 100 ? '...' : ''}`);
          console.log(`Tags: ${result.tags?.join(', ') || 'none'}`);
          console.log(`ID: ${result.airtable_id}`);
          
          // 添加内容长度信息
          if (result.content) {
            console.log(`Content length: ${result.content.length} characters`);
          }
          
          // 添加结果对象的调试信息
          console.log('Debug - Result keys:', Object.keys(result));
        });
      }
    } catch (error) {
      console.error(`Error searching for query "${query}":`, error);
      console.error(`Stack trace:`, error instanceof Error ? error.stack : String(error));
    }
  }
  
  // Then test enhanced search
  console.log('\n\n🔍 ENHANCED SEARCH TEST');
  
  // Test enhanced search with the same queries
  for (const { query, threshold, limit } of queries) {
    console.log(`\n--- Testing enhanced query: "${query}" ---`);
    
    try {
      console.log(`🕒 Enhanced search started at: ${new Date().toISOString()}`);
      const startTime = Date.now();
      
      // 记录查询参数
      console.log(`Query parameters: { query: "${query}", limit: ${limit} }`);
      
      const results = await enhancedSearchKnowledgeEmbeddings(query, limit, threshold);
      const duration = Date.now() - startTime;
      
      // 保存结果用于后续比较
      allResults.enhanced.push({
        query,
        results,
        duration
      });
      
      if (results.length === 0) {
        console.log(`❌ No results found for enhanced query: "${query}" (search took ${duration}ms)`);
      } else {
        console.log(`✅ Found ${results.length} results in ${duration}ms:`);
        
        results.forEach((result, index) => {
          console.log(`\nResult #${index + 1} (similarity: ${(result.similarity * 100).toFixed(2)}%)`);
          console.log(`Title: ${result.title}`);
          console.log(`Description: ${result.description?.substring(0, 100)}${result.description && result.description.length > 100 ? '...' : ''}`);
          console.log(`Tags: ${result.tags?.join(', ') || 'none'}`);
          console.log(`ID: ${result.airtable_id}`);
          
          // 添加内容长度信息
          if (result.content) {
            console.log(`Content length: ${result.content.length} characters`);
          }
          
          // 添加结果对象的调试信息
          console.log('Debug - Result keys:', Object.keys(result));
        });
      }
    } catch (error) {
      console.error(`Error searching for enhanced query "${query}":`, error);
      console.error(`Stack trace:`, error instanceof Error ? error.stack : String(error));
    }
  }
  
  // 比较标准搜索和增强搜索结果
  console.log('\n\n🔄 COMPARING STANDARD VS ENHANCED SEARCH RESULTS');
  
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i].query;
    const standardResults = allResults.standard[i];
    const enhancedResults = allResults.enhanced[i];
    
    console.log(`\n--- Comparison for query: "${query}" ---`);
    console.log(`Standard search: ${standardResults.results.length} results in ${standardResults.duration}ms`);
    console.log(`Enhanced search: ${enhancedResults.results.length} results in ${enhancedResults.duration}ms`);
    
    // 比较顶部结果
    if (standardResults.results.length > 0 && enhancedResults.results.length > 0) {
      console.log('\nTop result comparison:');
      console.log(`Standard top result: "${standardResults.results[0].title}" (${(standardResults.results[0].similarity * 100).toFixed(2)}%)`);
      console.log(`Enhanced top result: "${enhancedResults.results[0].title}" (${(enhancedResults.results[0].similarity * 100).toFixed(2)}%)`);
      
      // 检查顶部结果是否相同
      const sameTopResult = standardResults.results[0].airtable_id === enhancedResults.results[0].airtable_id;
      console.log(`Same top result: ${sameTopResult ? '✅ Yes' : '❌ No'}`);
      
      // 查找独有结果
      const standardIds = new Set(standardResults.results.map(r => r.airtable_id));
      const enhancedIds = new Set(enhancedResults.results.map(r => r.airtable_id));
      
      const uniqueToStandard = [...standardIds].filter(id => !enhancedIds.has(id));
      const uniqueToEnhanced = [...enhancedIds].filter(id => !standardIds.has(id));
      
      console.log(`Results unique to standard search: ${uniqueToStandard.length}`);
      console.log(`Results unique to enhanced search: ${uniqueToEnhanced.length}`);
    }
    
    // 性能比较
    const perfDiff = enhancedResults.duration - standardResults.duration;
    console.log(`Performance difference: ${perfDiff}ms (${perfDiff > 0 ? 'enhanced is slower' : 'enhanced is faster'})`);
  }
  
  // 生成统计摘要
  console.log('\n\n📊 SUMMARY STATISTICS');
  
  const standardTotalTime = allResults.standard.reduce((sum, item) => sum + item.duration, 0);
  const enhancedTotalTime = allResults.enhanced.reduce((sum, item) => sum + item.duration, 0);
  
  const standardAvgTime = (standardTotalTime / allResults.standard.length).toFixed(2);
  const enhancedAvgTime = (enhancedTotalTime / allResults.enhanced.length).toFixed(2);
  
  console.log(`Average standard search time: ${standardAvgTime}ms`);
  console.log(`Average enhanced search time: ${enhancedAvgTime}ms`);
  
  const standardTotalResults = allResults.standard.reduce((sum, item) => sum + item.results.length, 0);
  const enhancedTotalResults = allResults.enhanced.reduce((sum, item) => sum + item.results.length, 0);
  
  console.log(`Total standard search results: ${standardTotalResults}`);
  console.log(`Total enhanced search results: ${enhancedTotalResults}`);
  
  // 记录没有结果的查询
  const queriesWithNoStandardResults = allResults.standard
    .filter(item => item.results.length === 0)
    .map(item => item.query);
  
  const queriesWithNoEnhancedResults = allResults.enhanced
    .filter(item => item.results.length === 0)
    .map(item => item.query);
  
  console.log(`\nQueries with no standard results: ${queriesWithNoStandardResults.length > 0 ? queriesWithNoStandardResults.join(', ') : 'None'}`);
  console.log(`Queries with no enhanced results: ${queriesWithNoEnhancedResults.length > 0 ? queriesWithNoEnhancedResults.join(', ') : 'None'}`);
  
  console.log('\n=== Vector Search Testing Complete ===');
  console.log(`🕒 Test finished at: ${new Date().toISOString()}`);
  console.log(`🕒 Total test duration: ${(Date.now() - testStartTime) / 1000}s`);
}

/**
 * 使用单个查询进行详细调试测试
 * @param query 测试的查询字符串
 * @param threshold 相似度阈值
 * @param limit 最大结果数量
 */
async function testSingleQuery(query: string, threshold: number = 0.5, limit: number = 5) {
  console.log(`=== Detailed Test for Query: "${query}" ===`);
  
  try {
    console.log('\n🔍 STANDARD SEARCH:');
    console.log(`Parameters: threshold=${threshold}, limit=${limit}`);
    
    const startTime = Date.now();
    const results = await searchKnowledgeEmbeddings(query, limit, threshold);
    const duration = Date.now() - startTime;
    
    console.log(`Search completed in ${duration}ms, found ${results.length} results`);
    
    if (results.length === 0) {
      console.log('❌ No results found');
    } else {
      console.log('\nResults:');
      results.forEach((result, index) => {
        console.log(`\n--- Result #${index + 1} ---`);
        console.log(`Similarity: ${(result.similarity * 100).toFixed(2)}%`);
        console.log(`Title: ${result.title}`);
        console.log(`ID: ${result.airtable_id}`);
        console.log(`Description: ${result.description?.substring(0, 150)}${result.description && result.description.length > 150 ? '...' : ''}`);
        console.log(`Tags: ${result.tags?.join(', ') || 'none'}`);
        
        // 显示完整内容用于详细调试
        console.log(`\nFull Content (${result.content?.length || 0} chars):`);
        console.log(result.content || '[No content]');
        
        // 显示所有属性
        console.log('\nAll properties:');
        for (const [key, value] of Object.entries(result)) {
          const displayValue = typeof value === 'string' 
            ? value.substring(0, 50) + (value.length > 50 ? '...' : '')
            : value;
          console.log(`- ${key}: ${displayValue}`);
        }
      });
    }
    
    // 为同一查询尝试增强搜索
    console.log('\n\n🔍 ENHANCED SEARCH:');
    
    const enhancedStartTime = Date.now();
    const enhancedResults = await enhancedSearchKnowledgeEmbeddings(query, limit);
    const enhancedDuration = Date.now() - enhancedStartTime;
    
    console.log(`Enhanced search completed in ${enhancedDuration}ms, found ${enhancedResults.length} results`);
    
    if (enhancedResults.length === 0) {
      console.log('❌ No enhanced results found');
    } else {
      console.log('\nEnhanced Results:');
      enhancedResults.forEach((result, index) => {
        console.log(`\n--- Result #${index + 1} ---`);
        console.log(`Similarity: ${(result.similarity * 100).toFixed(2)}%`);
        console.log(`Title: ${result.title}`);
        console.log(`ID: ${result.airtable_id}`);
        console.log(`Description: ${result.description?.substring(0, 150)}${result.description && result.description.length > 150 ? '...' : ''}`);
        console.log(`Tags: ${result.tags?.join(', ') || 'none'}`);
      });
    }
    
  } catch (error) {
    console.error(`Error during detailed test:`, error);
    console.error(`Stack trace:`, error instanceof Error ? error.stack : String(error));
  }
}

// 选择要运行的测试
const testMode = process.env.TEST_MODE || 'full';
const testQuery = process.env.TEST_QUERY || 'What is Prompt is law?';
const testThreshold = parseFloat(process.env.TEST_THRESHOLD || '0.5');
const testLimit = parseInt(process.env.TEST_LIMIT || '5');

// 运行选定的测试
if (testMode === 'single') {
  console.log(`Running single query test with: "${testQuery}"`);
  testSingleQuery(testQuery, testThreshold, testLimit)
    .then(() => {
      console.log('Single query test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Single query test failed:', error);
      process.exit(1);
    });
} else {
  // 运行完整测试套件
  testVectorSearch()
    .then(() => {
      console.log('Testing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Testing failed:', error);
      process.exit(1);
    });
}