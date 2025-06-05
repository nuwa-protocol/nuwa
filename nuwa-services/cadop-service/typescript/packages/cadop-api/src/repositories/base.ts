import { supabase } from '../config/supabase.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export interface BaseRecord {
  id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Repository<T extends BaseRecord> {
  findById(id: string): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export abstract class BaseRepository<T extends BaseRecord> implements Repository<T> {
  protected constructor(
    protected readonly tableName: string
  ) {}

  protected abstract mapToRecord(data: any): T;

  /**
   * Convert a date object to an ISO string
   */
  protected serializeDate(date: Date | string | null | undefined): string {
    if (!date) return new Date().toISOString();
    return date instanceof Date ? date.toISOString() : date;
  }

  /**
   * Convert an ISO string to a date object
   */
  protected deserializeDate(date: string | null | undefined): Date {
    if (!date) return new Date();
    return new Date(date);
  }

  /**
   * Serialize data for database storage
   */
  protected serializeData(data: Partial<T>): Record<string, any> {
    const serialized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        serialized[key] = this.serializeDate(value);
      } else {
        serialized[key] = value;
      }
    }

    return serialized;
  }

  /**
   * Get a base query builder
   */
  protected getQuery(): ReturnType<typeof supabase.from> {
    return (supabase as SupabaseClient).from(this.tableName);
  }

  /**
   * Find a record by id
   * @param id - The id of the record to find
   * @returns The record or null if not found
   */
  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.getQuery()
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // 记录不存在
        return null;
      }
      logger.error(`Failed to find ${this.tableName} by id:`, error);
      throw error;
    }

    return data ? this.mapToRecord(data) : null;
  }

  /**
   * Create a new record
   * @param data - The data to create the record with
   * @returns The created record
   */
  async create(data: Partial<T>): Promise<T> {
    const serialized = this.serializeData(data);
    const { data: record, error } = await this.getQuery()
      .insert(serialized)
      .select()
      .single();

    if (error) {
      logger.error(`Failed to create ${this.tableName}:`, error);
      throw error;
    }

    return this.mapToRecord(record);
  }

  /**
   * Update an existing record
   * @param id - The id of the record to update
   * @param data - The data to update the record with
   * @returns The updated record
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    const serialized = this.serializeData(data);
    const { data: record, error } = await this.getQuery()
      .update(serialized)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error(`Failed to update ${this.tableName}:`, error);
      throw error;
    }

    return this.mapToRecord(record);
  }

  /**
   * Delete a record
   * @param id - The id of the record to delete
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.getQuery()
      .delete()
      .eq('id', id);

    if (error) {
      logger.error(`Failed to delete ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute a custom query
   * @param builder - The query builder to execute
   * @returns The result of the query
   */
  protected async customQuery<R = T>(
    builder: (query: ReturnType<SupabaseClient['from']>) => any
  ): Promise<R | null> {
    const { data, error } = await builder(this.getQuery());

    if (error) {
      if (error.code === 'PGRST116') { // Record not found
        return null;
      }
      logger.error(`Failed to execute custom query on ${this.tableName}:`, error);
      throw error;
    }

    return data;
  }
} 