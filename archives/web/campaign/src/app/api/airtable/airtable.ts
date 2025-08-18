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

