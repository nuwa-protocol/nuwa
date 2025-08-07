import { createClient } from '@supabase/supabase-js';
import type { Cap } from './type.js';
import { config } from 'dotenv';
import {PACKAGE_ID, SUPABASE_KEY, SUPABASE_URL} from './constant.js';
import {IndexerEventIDView} from "@roochnetwork/rooch-sdk";

config();

const CURSOR_TABLE_NAME = "rooch_cursor_state";

function serializeCursor(cursor: IndexerEventIDView | null): string | null {
  return cursor ? JSON.stringify(cursor) : null;
}

function deserializeCursor(cursorStr: string | null): IndexerEventIDView | null {
  if (!cursorStr) return null;
  try {
    const parsed = JSON.parse(cursorStr) as IndexerEventIDView;

    if (parsed?.event_index && parsed?.tx_order) {
      return parsed;
    }
    throw new Error('Invalid cursor structure');
  } catch (e) {
    console.error('Cursor deserialization failed:', e);
    return null;
  }
}

export async function getLastCursor(): Promise<IndexerEventIDView | null> {
  try {
    const { data, error } = await supabase
      .from(CURSOR_TABLE_NAME)
      .select('cursor')
      .eq('event_type', `${PACKAGE_ID}::acp_registry::RegisterEvent`)
      .single();

    if (error || !data || !data.cursor) {
      console.warn('Cursor not found, starting from beginning:', error?.message);
      return null;
    }
    return deserializeCursor(data.cursor);
  } catch (e) {
    console.error('Error fetching cursor:', e);
    return null;
  }
}

export async function saveCursor(cursor: IndexerEventIDView | null) {
  try {
    const cursorStr = serializeCursor(cursor);
    const { error } = await supabase
      .from(CURSOR_TABLE_NAME)
      .upsert(
        {
          event_type: `${PACKAGE_ID}::acp_registry::RegisterEvent`,
          cursor: cursorStr,
          last_updated: new Date()
        },
        { onConflict: 'event_type' }
      );

    if (error) throw error;
    console.log(`Cursor saved: ${cursorStr}`);
  } catch (e) {
    console.error('Error saving cursor:', e);
  }
}

export async function getLastUpdateCursor(): Promise<IndexerEventIDView | null> {
  try {
    const { data, error } = await supabase
      .from(CURSOR_TABLE_NAME)
      .select('cursor')
      .eq('event_type', `${PACKAGE_ID}::acp_registry::UpdateEvent`)
      .single();

    if (error || !data || !data.cursor) {
      console.warn('Cursor not found, starting from beginning:', error?.message);
      return null;
    }
    return deserializeCursor(data.cursor);
  } catch (e) {
    console.error('Error fetching cursor:', e);
    return null;
  }
}

export async function saveUpdateCursor(cursor: IndexerEventIDView | null) {
  try {
    const cursorStr = serializeCursor(cursor);
    const { error } = await supabase
      .from(CURSOR_TABLE_NAME)
      .upsert(
        {
          event_type: `${PACKAGE_ID}::acp_registry::UpdateEvent`,
          cursor: cursorStr,
          last_updated: new Date()
        },
        { onConflict: 'event_type' }
      );

    if (error) throw error;
    console.log(`Cursor saved: ${cursorStr}`);
  } catch (e) {
    console.error('Error saving cursor:', e);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function storeToSupabase(
  data: Cap,
  cid: string,
  car_uri: string,
  version: number
): Promise<void> {
  const { data: existingData, error: queryError } = await supabase
    .from("ipfs_data")
    .select("version")
    .eq("car_uri", car_uri)
    .maybeSingle();

  if (queryError) {
    throw new Error(`Supabase query failed: ${queryError.message}`);
  }

  if (existingData && version <= existingData.version) {
    console.log(
      `Skipping update for ${car_uri}. ` +
        `Current version ${existingData.version} >= provided version ${version}`
    );
    return;
  }

  const { error } = await supabase.from("ipfs_data").upsert(
    {
      car_uri: car_uri,
      name: data.name || null,
      id: data.id || null,
      cid: cid,
      version: version,
      timestamp: new Date().toISOString(),
    },
    { onConflict: "car_uri" }
  );

  if (error) {
    throw new Error(`Supabase operation failed: ${error.message}`);
  }
}

export async function queryCIDFromSupabase(
  name?: string | null,
  cid?: string | null,
  page: number = 0,
  pageSize: number = 50
): Promise<{
  success: boolean;
  items?: Array<{ cid: string; name: string; id: string}>;
  totalItems?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  error?: string;
}> {
  try {
    // Validate page size (max 50 records per page)
    const validatedPageSize = Math.min(pageSize, 50);

    // Calculate pagination offset
    const offset = page * validatedPageSize;

    // Create base query
    let query = supabase
      .from('ipfs_data')
      .select('cid, name, id', { count: 'exact' });

    // Add filtering conditions
    if (name) query = query.ilike('name', `%${name}%`);
    if (cid) query = query.ilike('cid', `%${cid}%`);

    // Apply pagination
    query = query.range(offset, offset + validatedPageSize - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) throw error;

    // Handle empty results
    if (!data || data.length === 0) {
      return {
        success: false,
        page,
        pageSize: validatedPageSize,
        totalItems: 0,
        totalPages: 0,
        error: 'No records found matching the criteria'
      };
    }

    // Calculate total pages
    const totalItems = count || data.length;
    const totalPages = Math.ceil(totalItems / validatedPageSize);

    return {
      success: true,
      items: data.map(item => ({
        cid: item.cid,
        name: item.name,
        id: item.id,
      })),
      totalItems,
      page,
      pageSize: validatedPageSize,
      totalPages
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown query error'
    };
  }
}