import { createClient } from '@supabase/supabase-js';
import { YamlData } from './eventHandle';

import { config } from 'dotenv';


config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY!;

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 存储数据到 Supabase
export async function storeToSupabase(data: YamlData): Promise<void> {
  const { error } = await supabase
    .from('ipfs_data')
    .upsert(
      {
        name: data.name,
        id: data.id,
        cid: data.cid,
        timestamp: new Date().toISOString()
      },
      { onConflict: 'cid' }
    );

  if (error) {
    throw new Error(`Supabase operation failed: ${error.message}`);
  }
}

// 从 Supabase 查询 CID
export async function queryCIDFromSupabase(name: string, id: string): Promise<{ cid: string }> {
  const { data, error } = await supabase
    .from('ipfs_data')
    .select('cid')
    .eq('name', name)
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Record not found');

  return { cid: data.cid };
}