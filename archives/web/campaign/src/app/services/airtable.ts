// 这是一个服务端文件，不应该在客户端导入
// This is a server-side file and should not be imported on the client side
import Airtable from 'airtable';

// Initialize Airtable client
const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

// Mission data interface
export interface Mission {
    id: string;
    title: string;
    description: string;
    suggestionText: string;
    suggested?: boolean;
    prompt?: string;
    order?: number;
}

// Get all missions data
export const getMissions = async (): Promise<Mission[]> => {
    try {
        const table = base('Missions');

        // Get all records with sorting by order field
        const records = await table.select({
            sort: [{ field: 'order', direction: 'asc' }]
        }).all();

        // Convert records to Mission format
        const missions: Mission[] = records.map((record) => ({
            id: record.get('id') as string,
            title: record.get('title') as string,
            description: record.get('description') as string,
            suggestionText: record.get('suggestionText') as string,
            suggested: record.get('suggested') as boolean || false,
            prompt: record.get('Prompt') as string || '',
            order: record.get('order') as number || 0,
        }));

        return missions;
    } catch (error) {
        console.error('Error fetching missions from Airtable:', error);
        return [];
    }
};

// Define the updated interface for the Knowledge Record
export interface KnowledgeRecord {
    airtableId: string;        // Airtable's internal record ID (from record.id) - USE THIS FOR API UPDATES
    key?: string;              // Your custom 'id' field from Airtable's primary field (renamed)
    title?: string;
    content?: string;
    description?: string;
    last_modified_time?: string; // ISO 8601 string from Airtable field
    last_synced_at?: string;     // ISO 8601 string from Airtable field
    status?: 'Draft' | 'Ready for Sync' | 'Synced' | 'Needs Update' | 'Error' | 'Archived';
    sync_error_message?: string;
    tags?: string[];             // Assuming 'tags' is a multi-select field
}

// Define a more specific type for the fields being updated
type KnowledgeUpdateFields = {
    status: KnowledgeRecord['status'];
    last_synced_at: string;
    sync_error_message: string | null;
};

// Define the updated function to get records that need syncing
export const getKnowledgeRecordsToSync = async (): Promise<KnowledgeRecord[]> => {
    const recordsToSync: KnowledgeRecord[] = [];
    try {
        const table = base('Knowledge'); // Use your actual table name 'Knowledge'

        await table.select({
            // Filter records where status is 'Ready for Sync' or 'Needs Update'
            // Ensure the field name 'status' matches exactly in Airtable
            filterByFormula: "OR({status} = 'Ready for Sync', {status} = 'Needs Update')",
            // Specify fields to fetch, including your custom 'id' field (named 'key' in the interface)
            // Ensure 'id' field name is correct in Airtable for the primary field
            fields: ['key', 'title', 'content', 'description', 'last_modified_time', 'last_synced_at', 'status', 'sync_error_message', 'tags']
        }).eachPage((pageRecords, fetchNextPage) => {
            pageRecords.forEach((record) => {
                recordsToSync.push({
                    airtableId: record.id, // Internal Airtable ID for API calls
                    key: record.get('key') as string | undefined, 
                    title: record.get('title') as string | undefined,
                    content: record.get('content') as string | undefined,
                    description: record.get('description') as string | undefined,
                    last_modified_time: record.get('last_modified_time') as string | undefined,
                    last_synced_at: record.get('last_synced_at') as string | undefined,
                    status: record.get('status') as KnowledgeRecord['status'] | undefined,
                    sync_error_message: record.get('sync_error_message') as string | undefined,
                    tags: record.get('tags') as string[] | undefined, // Assuming 'tags' is multi-select
                });
            });
            fetchNextPage();
        });

        console.log(`Fetched ${recordsToSync.length} knowledge records to sync.`);
        return recordsToSync;

    } catch (error) {
        console.error('Error fetching knowledge records from Airtable:', error);
        return []; // Return empty array on error
    }
};

/**
 * Updates the sync status of a specific knowledge record in Airtable.
 * Uses the exact field names: 'status', 'last_synced_at', 'sync_error_message'.
 * @param airtableId The Airtable Record ID of the record to update.
 * @param newStatus The new status to set.
 * @param errorMessage Optional error message if the sync failed.
 * @returns Promise<boolean> Indicates success or failure of the update operation.
 */
export const updateKnowledgeRecordSyncStatus = async (
    airtableId: string,
    newStatus: KnowledgeRecord['status'],
    errorMessage?: string
): Promise<boolean> => {
    try {
        const table = base('Knowledge'); // Use your actual table name

        // Use the exact field names from Airtable and the specific type
        const fieldsToUpdate: KnowledgeUpdateFields = {
            'status': newStatus,
            'last_synced_at': new Date().toISOString(), // Set sync time to now
            'sync_error_message': errorMessage || null // Clear error message if successful, set if failed
        };

        // Type assertion needed because Airtable SDK's update expects a generic object.
        // Suppress the 'any' lint error for this specific line as it's required for compatibility.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await table.update(airtableId, fieldsToUpdate as { [key: string]: any });
        console.log(`Updated sync status for record ${airtableId} to ${newStatus}`);
        return true;

    } catch (error) {
        console.error(`Error updating sync status for record ${airtableId} in Airtable:`, error);
        return false;
    }
};