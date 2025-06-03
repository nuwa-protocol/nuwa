import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { supabase } from '../config/supabase.js';

export class MigrationManager {
  private static migrationsPath = join(process.cwd(), 'database', 'migrations');
  private static seedsPath = join(process.cwd(), 'database', 'seeds');

  /**
   * Execute SQL file
   */
  private static async executeSqlFile(filePath: string): Promise<void> {
    const sql = readFileSync(filePath, 'utf-8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });

        if (error) {
          throw new Error(`Failed to execute SQL: ${error.message}\nSQL: ${statement}`);
        }
      }
    }
  }

  /**
   * Create migrations table
   */
  private static async createMigrationsTable(): Promise<void> {
    // Use direct table check and creation instead of RPC
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'schema_migrations');

    if (error) {
      console.log('Creating migrations table manually...');
    }

    // If table doesn't exist, we'll create it by running the schema file
    if (!data || data.length === 0) {
      console.log('⚠️  Database not initialized. Running schema file...');
      const schemaPath = join(process.cwd(), 'database', 'seeds', '001_schema.sql');
      try {
        await this.executeSqlFile(schemaPath);
        console.log('✅ Schema initialized successfully!');
      } catch (error) {
        console.error('❌ Failed to initialize schema:', error);
        throw error;
      }
    }
  }

  /**
   * Get list of applied migrations
   */
  private static async getAppliedMigrations(): Promise<string[]> {
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('version')
      .order('version');

    if (error) {
      throw new Error(`Failed to get applied migrations: ${error.message}`);
    }

    return data?.map((row: any) => row.version) || [];
  }

  /**
   * Mark migration as applied
   */
  private static async markMigrationApplied(version: string): Promise<void> {
    const { error } = await supabase
      .from('schema_migrations')
      .insert({ version });

    if (error) {
      throw new Error(`Failed to mark migration as applied: ${error.message}`);
    }
  }

  /**
   * Get list of migration files
   */
  private static getMigrationFiles(): string[] {
    try {
      return readdirSync(this.migrationsPath)
        .filter((file) => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      console.warn('No migrations directory found');
      return [];
    }
  }

  /**
   * Get list of seed files
   */
  private static getSeedFiles(): string[] {
    try {
      return readdirSync(this.seedsPath)
        .filter((file) => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      console.warn('No seeds directory found');
      return [];
    }
  }

  /**
   * Run pending migrations
   */
  static async runMigrations(): Promise<void> {
    console.log('🚀 Starting database migrations...');
    
    try {
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      
      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations();
      
      // Get migration files
      const migrationFiles = this.getMigrationFiles();
      
      if (migrationFiles.length === 0) {
        console.log('No migration files found.');
        return;
      }
      
      // Run pending migrations
      for (const file of migrationFiles) {
        const version = file.replace('.sql', '');
        
        if (!appliedMigrations.includes(version)) {
          const filePath = join(this.migrationsPath, file);
          await this.executeSqlFile(filePath);
          await this.markMigrationApplied(version);
          console.log(`✅ Applied migration: ${version}`);
        } else {
          console.log(`⏭️  Skipped (already applied): ${version}`);
        }
      }
      
      console.log('✅ All migrations completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Run database seeds
   */
  static async runSeeds(): Promise<void> {
    console.log('🌱 Starting database seeding...');
    
    try {
      // Ensure database is initialized
      await this.createMigrationsTable();
      
      const seedFiles = this.getSeedFiles();
      
      if (seedFiles.length === 0) {
        console.log('No seed files found.');
        return;
      }
      
      for (const file of seedFiles) {
        const filePath = join(this.seedsPath, file);
        await this.executeSqlFile(filePath);
        console.log(`✅ Applied seed: ${file}`);
      }
      
      console.log('✅ All seeds completed successfully!');
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  /**
   * Reset database (drop all tables and re-run migrations)
   */
  static async resetDatabase(): Promise<void> {
    console.log('🔄 Resetting database...');
    
    try {
      // Drop all tables (this is a destructive operation)
      const dropTablesSql = `
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        GRANT ALL ON SCHEMA public TO postgres;
        GRANT ALL ON SCHEMA public TO public;
      `;
      
      const { error } = await supabase.rpc('exec_sql', { sql: dropTablesSql });
      
      if (error) {
        throw new Error(`Failed to reset database: ${error.message}`);
      }
      
      console.log('✅ Database reset completed');
      
      // Re-run migrations
      await this.runMigrations();
      
    } catch (error) {
      console.error('❌ Database reset failed:', error);
      throw error;
    }
  }

  /**
   * Check database status
   */
  static async checkStatus(): Promise<void> {
    console.log('📊 Checking database status...');
    
    try {
      // Check if migrations table exists
      const { data: tables } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      console.log('📋 Database tables:');
      if (tables && tables.length > 0) {
        tables.forEach((table: any) => {
          console.log(`  - ${table.table_name}`);
        });
      } else {
        console.log('  No tables found');
      }

      // Check applied migrations
      try {
        const appliedMigrations = await this.getAppliedMigrations();
        console.log('\n📜 Applied migrations:');
        if (appliedMigrations.length > 0) {
          appliedMigrations.forEach((migration) => {
            console.log(`  - ${migration}`);
          });
        } else {
          console.log('  No migrations applied');
        }
      } catch (error) {
        console.log('  Migrations table not found');
      }

    } catch (error) {
      console.error('❌ Status check failed:', error);
    }
  }
}

// CLI interface when run directly
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      MigrationManager.runMigrations();
      break;
    case 'seed':
      MigrationManager.runSeeds();
      break;
    case 'reset':
      MigrationManager.resetDatabase();
      break;
    case 'status':
      MigrationManager.checkStatus();
      break;
    default:
      console.log(`
Usage: npx ts-node src/utils/migrate.ts <command>

Commands:
  migrate  - Run pending migrations
  seed     - Run database seeds  
  reset    - Reset database and re-run migrations
  status   - Check database status
      `);
  }
} 