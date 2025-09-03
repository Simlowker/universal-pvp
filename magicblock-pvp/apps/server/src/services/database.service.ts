import { db } from '@/lib/database/client';
import { logger } from '@/config/logger';

interface QueryResult {
  rows: any[];
  rowCount: number;
  command: string;
  oid: number;
  fields: any[];
}

export class DatabaseService {
  async checkHealth(): Promise<{
    isHealthy: boolean;
    latency: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      await db.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      
      return {
        isHealthy: true,
        latency
      };
    } catch (error) {
      logger.error('Database health check failed', error);
      return {
        isHealthy: false,
        latency: -1,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getConnectionStats() {
    try {
      const result = await db.prisma.$queryRaw`
        SELECT 
          numbackends as active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
        FROM pg_stat_database 
        WHERE datname = current_database()
      `;
      return result;
    } catch (error) {
      logger.error('Failed to get connection stats', error);
      return null;
    }
  }

  async getTableStats() {
    try {
      const stats = await db.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          n_live_tup as row_count,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `;
      return stats;
    } catch (error) {
      logger.error('Failed to get table stats', error);
      return [];
    }
  }

  async getSlowQueries(limit: number = 10) {
    try {
      const queries = await db.prisma.$queryRaw`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          max_time
        FROM pg_stat_statements
        ORDER BY mean_time DESC
        LIMIT ${limit}
      `;
      return queries;
    } catch (error) {
      logger.warn('Failed to get slow queries - pg_stat_statements may not be enabled', error);
      return [];
    }
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    try {
      // Use Prisma's $queryRawUnsafe for direct SQL queries
      const result = await db.prisma.$queryRawUnsafe(sql, ...(params || []));
      
      // Format the result to match the expected QueryResult interface
      // Note: Prisma doesn't return the same format as raw pg client
      // So we need to adapt it for compatibility
      if (Array.isArray(result)) {
        return {
          rows: result,
          rowCount: result.length,
          command: sql.trim().split(' ')[0].toUpperCase(),
          oid: 0,
          fields: []
        };
      }
      
      // For non-array results (like INSERT, UPDATE, DELETE)
      return {
        rows: [],
        rowCount: typeof result === 'number' ? result : 0,
        command: sql.trim().split(' ')[0].toUpperCase(),
        oid: 0,
        fields: []
      };
    } catch (error) {
      logger.error('Database query failed', { sql, params, error });
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();