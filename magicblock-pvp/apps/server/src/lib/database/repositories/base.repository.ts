import { PrismaClient, Prisma } from '@prisma/client';
import { db } from '../client';

/**
 * Base repository class with common CRUD operations and utilities
 */
export abstract class BaseRepository<T, CreateInput, UpdateInput, WhereInput> {
  protected prisma: PrismaClient;
  protected modelName: string;

  constructor(modelName: string) {
    this.prisma = db.prisma;
    this.modelName = modelName;
  }

  /**
   * Get model delegate for dynamic queries
   */
  protected get model(): any {
    return (this.prisma as any)[this.modelName];
  }

  /**
   * Find a single record by ID
   */
  async findById(id: string, include?: any): Promise<T | null> {
    return this.model.findUnique({
      where: { id },
      include,
    });
  }

  /**
   * Find a single record by custom criteria
   */
  async findOne(where: WhereInput, include?: any): Promise<T | null> {
    return this.model.findFirst({
      where,
      include,
    });
  }

  /**
   * Find multiple records
   */
  async findMany(
    options: {
      where?: WhereInput;
      include?: any;
      orderBy?: any;
      skip?: number;
      take?: number;
    } = {}
  ): Promise<T[]> {
    return this.model.findMany({
      where: options.where,
      include: options.include,
      orderBy: options.orderBy,
      skip: options.skip,
      take: options.take,
    });
  }

  /**
   * Count records matching criteria
   */
  async count(where?: WhereInput): Promise<number> {
    return this.model.count({ where });
  }

  /**
   * Create a new record
   */
  async create(data: CreateInput, include?: any): Promise<T> {
    return this.model.create({
      data,
      include,
    });
  }

  /**
   * Create multiple records
   */
  async createMany(data: CreateInput[]): Promise<{ count: number }> {
    return this.model.createMany({
      data,
      skipDuplicates: true,
    });
  }

  /**
   * Update a record by ID
   */
  async updateById(id: string, data: UpdateInput, include?: any): Promise<T> {
    return this.model.update({
      where: { id },
      data,
      include,
    });
  }

  /**
   * Update multiple records
   */
  async updateMany(where: WhereInput, data: UpdateInput): Promise<{ count: number }> {
    return this.model.updateMany({
      where,
      data,
    });
  }

  /**
   * Upsert a record
   */
  async upsert(
    where: WhereInput,
    create: CreateInput,
    update: UpdateInput,
    include?: any
  ): Promise<T> {
    return this.model.upsert({
      where,
      create,
      update,
      include,
    });
  }

  /**
   * Delete a record by ID
   */
  async deleteById(id: string): Promise<T> {
    return this.model.delete({
      where: { id },
    });
  }

  /**
   * Delete multiple records
   */
  async deleteMany(where: WhereInput): Promise<{ count: number }> {
    return this.model.deleteMany({
      where,
    });
  }

  /**
   * Check if a record exists
   */
  async exists(where: WhereInput): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Paginated query with metadata
   */
  async paginate(
    options: {
      where?: WhereInput;
      include?: any;
      orderBy?: any;
      page: number;
      limit: number;
    }
  ): Promise<{
    data: T[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const { page, limit, ...queryOptions } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.findMany({
        ...queryOptions,
        skip,
        take: limit,
      }),
      this.count(queryOptions.where),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Execute raw query
   */
  async raw<R = any>(query: string, params?: any[]): Promise<R> {
    return this.prisma.$queryRawUnsafe(query, ...(params || []));
  }

  /**
   * Execute query within transaction
   */
  async withTransaction<R>(
    callback: (tx: Prisma.TransactionClient) => Promise<R>
  ): Promise<R> {
    return db.withTransaction(callback);
  }

  /**
   * Bulk operations helper
   */
  async bulkOperation(
    operations: Array<{
      operation: 'create' | 'update' | 'delete';
      data: any;
      where?: any;
    }>
  ): Promise<any[]> {
    return this.withTransaction(async (tx) => {
      const results = [];
      const txModel = (tx as any)[this.modelName];

      for (const op of operations) {
        let result;
        switch (op.operation) {
          case 'create':
            result = await txModel.create({ data: op.data });
            break;
          case 'update':
            result = await txModel.update({
              where: op.where,
              data: op.data,
            });
            break;
          case 'delete':
            result = await txModel.delete({ where: op.where });
            break;
        }
        results.push(result);
      }

      return results;
    });
  }

  /**
   * Soft delete helper (if model has deletedAt field)
   */
  async softDelete(id: string): Promise<T> {
    return this.model.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Find with caching
   */
  async findWithCache<R = T>(
    cacheKey: string,
    queryFn: () => Promise<R>,
    ttlSeconds: number = 300
  ): Promise<R> {
    return db.cachedQuery(cacheKey, queryFn, ttlSeconds);
  }

  /**
   * Invalidate related cache
   */
  async invalidateCache(pattern: string): Promise<void> {
    return db.invalidateCache(pattern);
  }
}