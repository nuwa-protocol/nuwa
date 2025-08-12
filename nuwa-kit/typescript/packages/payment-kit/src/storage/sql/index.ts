export { SqlChannelRepository, type SqlChannelRepositoryOptions } from './channel.sql';

export { SqlRAVRepository, type SqlRAVRepositoryOptions } from './rav.sql';

export {
  SqlPendingSubRAVRepository,
  type SqlPendingSubRAVRepositoryOptions,
} from './pendingSubRav.sql';

export { encodeSubRAV, decodeSubRAV, getSubRAVHex } from './serialization';

// Node-only async factory to create repositories with a pg Pool loaded via dynamic import
import type { ChannelRepository } from '../interfaces/ChannelRepository';
import type { RAVRepository } from '../interfaces/RAVRepository';
import type { PendingSubRAVRepository } from '../interfaces/PendingSubRAVRepository';
import { SqlChannelRepository } from './channel.sql';
import { SqlRAVRepository } from './rav.sql';
import { SqlPendingSubRAVRepository } from './pendingSubRav.sql';

export async function createSqlStorageRepositories(options: {
  connectionString: string;
  tablePrefix?: string;
  autoMigrate?: boolean;
  allowUnsafeAutoMigrateInProd?: boolean;
}): Promise<{
  channelRepo: ChannelRepository;
  ravRepo: RAVRepository;
  pendingSubRAVRepo: PendingSubRAVRepository;
}> {
  const { connectionString, tablePrefix, autoMigrate, allowUnsafeAutoMigrateInProd } = options;
  const { Pool } = await import('pg');
  const isSupabase = connectionString.includes('supabase');
  const pool = new Pool({
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
  });

  return {
    channelRepo: new SqlChannelRepository({
      pool,
      tablePrefix,
      autoMigrate,
      allowUnsafeAutoMigrateInProd,
    }),
    ravRepo: new SqlRAVRepository({
      pool,
      tablePrefix,
      autoMigrate,
      allowUnsafeAutoMigrateInProd,
    }),
    pendingSubRAVRepo: new SqlPendingSubRAVRepository({
      pool,
      tablePrefix,
      autoMigrate,
      allowUnsafeAutoMigrateInProd,
    }),
  };
}
