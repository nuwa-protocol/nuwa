import { NextRequest, NextResponse } from 'next/server';
import { syncAllKnowledgeRecords } from '@/app/services/knowledgeSyncService';
import { getEmbeddingCount } from '@/app/services/vectorStore';

/**
 * API endpoint to trigger knowledge base sync
 * 
 * POST /api/knowledge/sync
 */
export async function POST(request: NextRequest) {
  try {
    // Validate request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Missing or invalid token' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (token !== process.env.KNOWLEDGE_SYNC_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid token' },
        { status: 401 }
      );
    }
    
    // Start sync process
    const startTime = Date.now();
    const syncedCount = await syncAllKnowledgeRecords();
    const totalTime = Date.now() - startTime;
    
    // Get total record count in vector database
    const totalEmbeddings = await getEmbeddingCount();
    
    return NextResponse.json({
      success: true,
      message: `Successfully synced ${syncedCount} knowledge records`,
      data: {
        syncedCount,
        totalEmbeddings,
        processingTimeMs: totalTime
      }
    });
    
  } catch (error) {
    console.error('Error in knowledge sync API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to sync knowledge',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * API endpoint to get sync status
 * 
 * GET /api/knowledge/sync
 */
export async function GET(request: NextRequest) {
  try {
    // Validate request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Missing or invalid token' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (token !== process.env.KNOWLEDGE_SYNC_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid token' },
        { status: 401 }
      );
    }
    
    // Get total record count in vector database
    const totalEmbeddings = await getEmbeddingCount();
    
    return NextResponse.json({
      success: true,
      data: {
        totalEmbeddings,
        lastChecked: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error in knowledge sync status API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 