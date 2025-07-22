import { createClient } from '@supabase/supabase-js';
import { YamlData } from './eventHandle.js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function storeToSupabase(data: YamlData, cid: string): Promise<void> {
  const { error } = await supabase
    .from('ipfs_data')
    .upsert(
      {
        name: data.name || null,
        id: data.id || null,
        cid: cid,
        timestamp: new Date().toISOString()
      },
      { onConflict: 'cid' }
    );

  if (error) {
    throw new Error(`Supabase operation failed: ${error.message}`);
  }
}

export async function queryCIDFromSupabase(
  name?: string | null,
  id?: string | null
): Promise<{ success: boolean; cid?: string[]; error?: string }> {
  try {

    let query = supabase
      .from('ipfs_data')
      .select('cid, name, id');

    if (name) query = query.ilike('name', name);
    if (id) query = query.ilike('id', id);

    const { data, error } = await query;


    if (error) throw error;


    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'No records found matching the criteria'
      };
    }


    const cid = data.map(item => item.cid);

    return {
      success: true,
      cid: cid
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown query error'
    };
  }
}