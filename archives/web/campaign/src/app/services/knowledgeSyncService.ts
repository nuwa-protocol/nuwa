import { getKnowledgeRecordsToSync, updateKnowledgeRecordSyncStatus, KnowledgeRecord } from './airtable';
import { upsertKnowledgeEmbedding, deleteKnowledgeEmbedding } from './vectorStore';

/**
 * Sync a single knowledge record to vector storage
 * @param record The knowledge record to sync
 * @returns Returns true if successful, false if failed
 */
async function syncKnowledgeRecord(record: KnowledgeRecord): Promise<boolean> {
  try {
    // Check if record has necessary fields
    if (!record.content || !record.airtableId) {
      await updateKnowledgeRecordSyncStatus(
        record.airtableId,
        'Error',
        'Missing required content for embedding'
      );
      return false;
    }

    // Sync record to vector storage
    const success = await upsertKnowledgeEmbedding(record);

    // Update sync status in Airtable
    if (success) {
      await updateKnowledgeRecordSyncStatus(record.airtableId, 'Synced');
      console.log(`Successfully synced knowledge record: ${record.airtableId}`);
      return true;
    } else {
      await updateKnowledgeRecordSyncStatus(
        record.airtableId,
        'Error',
        'Failed to create/update embedding'
      );
      return false;
    }
  } catch (error) {
    console.error(`Error syncing knowledge record ${record.airtableId}:`, error);
    
    // Update record status to error
    await updateKnowledgeRecordSyncStatus(
      record.airtableId,
      'Error',
      error instanceof Error ? error.message : String(error)
    );
    
    return false;
  }
}

/**
 * Sync all knowledge records that need syncing
 * @returns Number of successfully synced records
 */
export async function syncAllKnowledgeRecords(): Promise<number> {
  try {
    // Get records that need syncing
    const recordsToSync = await getKnowledgeRecordsToSync();
    console.log(`Found ${recordsToSync.length} knowledge records to sync`);
    
    if (recordsToSync.length === 0) {
      return 0;
    }

    // Track number of successfully synced records
    let successCount = 0;

    // Sync all records in sequence
    for (const record of recordsToSync) {
      const success = await syncKnowledgeRecord(record);
      if (success) {
        successCount++;
      }
    }

    console.log(`Synced ${successCount} out of ${recordsToSync.length} knowledge records`);
    return successCount;
  } catch (error) {
    console.error('Error in syncAllKnowledgeRecords:', error);
    return 0;
  }
}

/**
 * Handle archiving of knowledge record
 * @param recordId Airtable record ID
 * @returns Returns true if successful, false if failed
 */
export async function archiveKnowledgeRecord(recordId: string): Promise<boolean> {
  try {
    // Delete record from vector storage
    const success = await deleteKnowledgeEmbedding(recordId);
    
    // Update status in Airtable
    if (success) {
      await updateKnowledgeRecordSyncStatus(recordId, 'Archived');
      console.log(`Successfully archived knowledge record: ${recordId}`);
      return true;
    } else {
      await updateKnowledgeRecordSyncStatus(
        recordId,
        'Error',
        'Failed to delete embedding during archive'
      );
      return false;
    }
  } catch (error) {
    console.error(`Error archiving knowledge record ${recordId}:`, error);
    
    // Update record status to error
    await updateKnowledgeRecordSyncStatus(
      recordId,
      'Error',
      error instanceof Error ? error.message : String(error)
    );
    
    return false;
  }
} 