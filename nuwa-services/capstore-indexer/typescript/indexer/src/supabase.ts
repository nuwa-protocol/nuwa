import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import {PACKAGE_ID, SUPABASE_KEY, SUPABASE_URL} from './constant.js';
import {IndexerEventIDView} from "@roochnetwork/rooch-sdk";
import {CapMetadata, CapStats} from './type.js';

config();

const CAP_SYNC_TABLE_NAME = "cap_sync_state";
const CAP_TABLE_NAME = "cap_data"
const CAP_STATS_TABLE_NAME = "cap_stats";
const USER_FAVORITE_CAPS_TABLE_NAME = "user_favorite_caps";
const USER_CAP_RATINGS_TABLE_NAME = "user_cap_ratings";

/**
 * Serializes an IndexerEventIDView cursor to a JSON string
 * @param cursor - The cursor object to serialize
 * @returns JSON string representation of the cursor or null
 */
function serializeCursor(cursor: IndexerEventIDView | null): string | null {
  return cursor ? JSON.stringify(cursor) : null;
}

/**
 * Deserializes a JSON string back to an IndexerEventIDView cursor
 * @param cursorStr - JSON string representation of the cursor
 * @returns Parsed cursor object or null if invalid
 */
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

/**
 * Retrieves the last processed cursor for RegisterEvent synchronization
 * @returns Promise<IndexerEventIDView | null> - The last cursor or null if not found
 */
export async function queryLastRegisterEventCursor(): Promise<IndexerEventIDView | null> {
  try {
    const { data, error } = await supabase
      .from(CAP_SYNC_TABLE_NAME)
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

/**
 * Saves the current cursor position for RegisterEvent synchronization
 * @param cursor - The cursor position to save
 */
export async function saveRegisterEventCursor(cursor: IndexerEventIDView | null) {
  try {
    const cursorStr = serializeCursor(cursor);
    const { error } = await supabase
      .from(CAP_SYNC_TABLE_NAME)
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

/**
 * Retrieves the last processed cursor for UpdateEvent synchronization
 * @returns Promise<IndexerEventIDView | null> - The last update cursor or null if not found
 */
export async function queryLastUpdateCursor(): Promise<IndexerEventIDView | null> {
  try {
    const { data, error } = await supabase
      .from(CAP_SYNC_TABLE_NAME)
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

/**
 * Saves the current cursor position for UpdateEvent synchronization
 * @param cursor - The cursor position to save for update events
 */
export async function saveUpdateEventCursor(cursor: IndexerEventIDView | null) {
  try {
    const cursorStr = serializeCursor(cursor);
    const { error } = await supabase
      .from(CAP_SYNC_TABLE_NAME)
      .upsert(
        {
          event_type: `${PACKAGE_ID}::acp_registry::UpdateEvent`,
          cursor: cursorStr,
          last_updated: new Date()
        },
        { onConflict: 'event_type' }
      );

    if (error) throw error;
    console.log(`Update Cursor saved: ${cursorStr}`);
  } catch (e) {
    console.error('Error saving cursor:', e);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Stores CAP data to Supabase database with version checking to prevent downgrades
 * @param data - The parsed YAML data containing CAP information
 * @param cid - Content Identifier for the CAP data on IPFS
 * @param car_uri - Unique CAP URI identifier
 * @param version - Version number of the CAP
 * @throws Error if database operations fail
 */
export async function saveCapToSupabase(
  data: any,
  cid: string,
  version: number,
): Promise<void> {
  try {
    const id = data.id
    // Query existing record
    const { data: existingData, error: queryError } = await supabase
      .from(CAP_TABLE_NAME)
      .select("version, cid")
      .eq("id", id)
      .maybeSingle();

    if (queryError) {
      throw new Error(`Supabase query failed: ${queryError.message}`);
    }

    // If record exists and version doesn't need updating
    if (existingData && version <= existingData.version) {
      console.log(
        `✅ Skipping update for ${id}. ` +
          `Current version ${existingData.version} >= provided version ${version}, ` +
          `CID: ${existingData.cid}`
      );
      return;
    }

    // Execute upsert operation
    const { error } = await supabase.from(CAP_TABLE_NAME).upsert(
      {
        name: data.idName,
        id: id,
        cid: cid,
        display_name: data.metadata.displayName,
        description: data.metadata.description,
        submitted_at: data.metadata.submittedAt,
        homepage: data.metadata.homepage,
        repository: data.metadata.repository,
        thumbnail: data.metadata.thumbnail,
        tags: data.metadata.tags,
        version: version,
        timestamp: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      throw new Error(`Supabase operation failed: ${error.message}`);
    }

    if (existingData) {
      console.log(`✅ Updated ${id} from version ${existingData.version} to ${version}, CID: ${cid}`);
    } else {
      console.log(`✅ Inserted new record for ${id}, version ${version}, CID: ${cid}`);
      // Initialize stats for new cap
      await supabase.from(CAP_STATS_TABLE_NAME).insert({ cap_id: id });
    }
  } catch (error) {
    console.error(`❌ Failed to store ${data.id} to Supabase:`, (error as Error).message);
    throw error; // Re-throw error for upper-level handling
  }
}

/**
 * Queries CAP data from Supabase database with filtering and pagination
 * @param name - Optional name filter (partial match)
 * @param cid - Optional CID filter (partial match)
 * @param tags - Optional array of tags to filter by
 * @param page - Page number starting from 0
 * @param pageSize - Number of items per page (max 50)
 * @returns Promise with query results including pagination information
 */
export async function queryFromSupabase(
  id?: string | null,
  name?: string | null,
  cid?: string | null,
  tags?: string[] | null,
  page: number = 0,
  pageSize: number = 50,
  sortBy?: 'average_rating' | 'downloads' | 'favorites' | 'rating_count' | 'updated_at' | null,
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<{
  success: boolean;
  items?: Array<CapMetadata>;
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

    // Create base query - we'll handle sorting differently based on the field
    let query;
    let isStatsQuery = false;
    
    if (sortBy && sortBy !== 'updated_at') {
      // For cap_stats fields, query from cap_stats table and join with cap_data
      // This allows us to sort by stats fields at the database level
      isStatsQuery = true;
      query = supabase
        .from(CAP_STATS_TABLE_NAME)
        .select(`
          *,
          cap_data!inner(*)
        `, { count: 'exact' });
        
      // Apply sorting on the stats table
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    } else {
      // For regular fields, use the standard approach
      query = supabase
        .from(CAP_TABLE_NAME)
        .select(`
          *,
          cap_stats(*)
        `, { count: 'exact' });
        
      // Add sorting for timestamp field
      if (sortBy === 'updated_at') {
        query = query.order('timestamp', { ascending: sortOrder === 'asc' });
      }
    }

    // Add filtering conditions - only add if values are not null/empty
    if (name && name.trim()) {
      if (isStatsQuery) {
        query = query.eq('cap_data.name', name);
        query = query.eq('cap_data.enable', true);
      } else {
        query = query.ilike('name', `%${name}%`);
        query = query.eq('enable', true);
      }
    }

    if (cid && cid.trim()) {
      if (isStatsQuery) {
        query = query.eq('cap_data.cid', cid);
      } else {
        query = query.eq('cid', cid);
      }
    }

    if (id && id.trim()) {
      if (isStatsQuery) {
        query = query.eq('cap_data.id', id);
      } else {
        query = query.eq('id', id);
      }
    }
    
    // Add tags filtering using PostgreSQL JSONB operators
    if (tags && tags.length > 0) {
      if (isStatsQuery) {
        const orConditions = tags
          .map(tag => `cap_data.tags.cs.${JSON.stringify([tag])}`)
          .join(',');
        query = query.or(orConditions);
      } else {
        const orConditions = tags
          .map(tag => `tags.cs.${JSON.stringify([tag])}`)
          .join(',');
        query = query.or(orConditions);
      }
    }

    // Apply pagination
    query = query.range(offset, offset + validatedPageSize - 1);

    // Execute query
    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    // Handle empty results
    if (!data || data.length === 0) {
      return {
        success: true,
        items: [],
        page,
        pageSize: validatedPageSize,
        totalItems: 0,
        totalPages: 0
      };
    }

    // Transform database fields from snake_case to camelCase to match CapMetadata interface
    let transformedItems = data.map((item: any) => {
      if (isStatsQuery) {
        // When querying from cap_stats table, the structure is different
        const capData = item.cap_data;
        return {
          id: capData.id,
          cid: capData.cid,
          name: capData.name,
          displayName: capData.display_name,
          description: capData.description,
          tags: capData.tags,
          submittedAt: capData.submitted_at,
          homepage: capData.homepage,
          repository: capData.repository,
          thumbnail: capData.thumbnail,
          enable: capData.enable,
          version: capData.version,
          stats: {
            capId: item.cap_id,
            downloads: item.downloads,
            ratingCount: item.rating_count,
            averageRating: item.average_rating,
            favorites: item.favorites,
          }
        };
      } else {
        // Standard structure when querying from cap_data table
        return {
          id: item.id,
          cid: item.cid,
          name: item.name,
          displayName: item.display_name,
          description: item.description,
          tags: item.tags,
          submittedAt: item.submitted_at,
          homepage: item.homepage,
          repository: item.repository,
          thumbnail: item.thumbnail,
          enable: item.enable,
          version: item.version,
          stats: item.cap_stats || {
            capId: item.id,
            downloads: 0,
            ratingCount: 0,
            averageRating: 0,
            favorites: 0,
          }
        };
      }
    });



    // Calculate total pages
    const totalItems = count || data.length;
    const totalPages = Math.ceil(totalItems / validatedPageSize);

    return {
      success: true,
      items: transformedItems,
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

/**
 * Retrieves all unique tags from the CAP database
 * @returns Promise with array of unique tags
 */
export async function queryAllTags(): Promise<{
  success: boolean;
  tags?: string[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from(CAP_TABLE_NAME)
      .select('tags');

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: true,
        tags: []
      };
    }

    // Extract and flatten all tags
    const allTags = new Set<string>();
    data.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((tag: string) => allTags.add(tag));
      }
    });

    return {
      success: true,
      tags: Array.from(allTags).sort()
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tags'
    };
  }
}

/**
 * Queries CAP data by exact tag match (all provided tags must be present)
 * @param tags - Array of tags that must all be present in the CAP
 * @param page - Page number starting from 0
 * @param pageSize - Number of items per page (max 50)
 * @returns Promise with query results for CAPs containing all specified tags
 */
export async function queryByExactTags(
  tags: string[],
  page: number = 0,
  pageSize: number = 50
): Promise<{
  success: boolean;
  items?: Array<{ cid: string; name: string; id: string, version: number, displayName: string, tags: string[]}>;
  totalItems?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  error?: string;
}> {
  try {
    const validatedPageSize = Math.min(pageSize, 50);
    const offset = page * validatedPageSize;

    // Use contains operator (@>) to check if tags array contains all specified tags
    const { data, count, error } = await supabase
      .from(CAP_TABLE_NAME)
      .select('cid, name, id, version, display_name, tags', { count: 'exact' })
      .contains('tags', tags)
      .range(offset, offset + validatedPageSize - 1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: true,
        items: [],
        page,
        pageSize: validatedPageSize,
        totalItems: 0,
        totalPages: 0
      };
    }

    const totalItems = count || data.length;
    const totalPages = Math.ceil(totalItems / validatedPageSize);

    return {
      success: true,
      items: data.map((item: any) => ({
        cid: item.cid,
        name: item.name,
        id: item.id,
        version: item.version,
        displayName: item.display_name,
        tags: item.tags || []
      })),
      totalItems,
      page,
      pageSize: validatedPageSize,
      totalPages
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to query by exact tags'
    };
  }
}

export async function queryCapStats(capId: string, userDID?: string): Promise<{
  success: boolean;
  stats?: CapStats;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from(CAP_STATS_TABLE_NAME)
      .select('*')
      .eq('cap_id', capId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const stats: CapStats = {
      capId: capId,
      downloads: data?.downloads ?? 0,
      ratingCount: data?.rating_count ?? 0,
      averageRating: data?.average_rating ?? 0,
      favorites: data?.favorites ?? 0,
    } as CapStats;

    if (userDID) {
      const { data: ratingData, error: ratingError } = await supabase
        .from(USER_CAP_RATINGS_TABLE_NAME)
        .select('rating')
        .eq('user_did', userDID)
        .eq('cap_id', capId)
        .maybeSingle();

      if (ratingError) {
        console.error('Failed to get user rating:', ratingError.message);
      } else {
        stats.userRating = ratingData?.rating ?? null;
      }
    }

    return { success: true, stats: stats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get cap stats'
    };
  }
}

export async function rateCap(userDID: string, capId: string, rating: number): Promise<{
  success: boolean;
  error?: string;
}> {
  if (rating < 1 || rating > 5) {
    return {
      success: false,
      error: 'Rating must be between 1 and 5',
    };
  }

  try {
    const { error } = await supabase.rpc('rate_cap', {
      p_user_did: userDID,
      p_cap_id: capId,
      p_rating: rating
    });

    if (error) {
        throw new Error(`Supabase RPC failed: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rate cap'
    };
  }
}

export async function incrementCapDownloads(capId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase.rpc('increment_cap_downloads', {
      p_cap_id: capId
    });

    if (error) {
      throw new Error(`Supabase RPC failed: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to increment cap downloads'
    };
  }
}

export async function queryUserFavoriteCaps(did: string, page: number = 0, pageSize: number = 50): Promise<{
  success: boolean;
  items?: any[];
  totalItems?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  error?: string;
}> {
    try {
        const validatedPageSize = Math.min(pageSize, 50);
        const offset = page * validatedPageSize;

        const { data, count, error } = await supabase
            .from(USER_FAVORITE_CAPS_TABLE_NAME)
            .select(`
                cap_data (
                    *,
                    cap_stats (*)
                )
            `, { count: 'exact' })
            .eq('user_did', did)
            .range(offset, offset + validatedPageSize - 1);

        if (error) throw error;

        const items = data?.map((fav: any) => fav.cap_data) || [];
        const totalItems = count || items.length;
        const totalPages = Math.ceil(totalItems / validatedPageSize);

        return {
            success: true,
            items,
            totalItems,
            page,
            pageSize: validatedPageSize,
            totalPages,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get user favorite caps'
        };
    }
}

export async function addToUserFavoriteCaps(did: string, capId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Start a transaction to ensure data consistency
    const { error: insertError } = await supabase
      .from(USER_FAVORITE_CAPS_TABLE_NAME)
      .insert({ user_did: did, cap_id: capId });
    
    if (insertError) throw insertError;

    // Update the favorites count in cap_stats using the database function
    const { error: updateError } = await supabase
      .rpc('increment_cap_favorites', { p_cap_id: capId });

    if (updateError) {
      console.warn(`Warning: Failed to update favorites count for cap ${capId}:`, updateError);
      // Don't fail the entire operation if stats update fails
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add to user favorite caps'
    };
  }
}

export async function removeFromUserFavoriteCaps(did: string, capId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Start a transaction to ensure data consistency
    const { error: deleteError } = await supabase
      .from(USER_FAVORITE_CAPS_TABLE_NAME)
      .delete()
      .eq('user_did', did)
      .eq('cap_id', capId);

    if (deleteError) throw deleteError;

    // Update the favorites count in cap_stats using the database function
    const { error: updateError } = await supabase
      .rpc('decrement_cap_favorites', { p_cap_id: capId });

    if (updateError) {
      console.warn(`Warning: Failed to update favorites count for cap ${capId}:`, updateError);
      // Don't fail the entire operation if stats update fails
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove from user favorite caps'
    };
  }
}

export async function isUserFavoriteCap(did: string, capId: string): Promise<{
  success: boolean;
  isFavorite?: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from(USER_FAVORITE_CAPS_TABLE_NAME)
      .select('user_did')
      .eq('user_did', did)
      .eq('cap_id', capId)
      .maybeSingle();

    if (error) throw error;

    return { 
      success: true, 
      isFavorite: !!data 
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check if cap is favorite'
    };
  }
}

export async function updateCapEnable(capId: string, enable: boolean): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase.from(CAP_TABLE_NAME).update({ enable: enable }).eq('id', capId);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update cap enable'
    };
  }
}