/**
 * Custom D1 adapter for better-auth
 * 
 * This adapter wraps the Cloudflare D1 REST API to work with better-auth's
 * database adapter interface using the createAdapterFactory pattern.
 * 
 * IMPORTANT: This adapter converts between camelCase (better-auth) and 
 * snake_case (D1 database schema).
 */

import { createAdapterFactory } from 'better-auth/adapters';
import type { BetterAuthOptions } from 'better-auth';

const D1_ACCOUNT_ID = process.env.D1_ACCOUNT_ID!;
const D1_DATABASE_ID = process.env.D1_DATABASE_ID!;
const D1_API_TOKEN = process.env.D1_API_TOKEN!;

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

interface D1Response<T> {
  success: boolean;
  errors: Array<{ message: string }>;
  result: Array<{
    results: T[];
    success: boolean;
    meta?: {
      changes?: number;
      last_row_id?: number;
    };
  }>;
}

// Convert camelCase to snake_case
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Convert snake_case to camelCase
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert object keys from camelCase to snake_case
function keysToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    result[toSnakeCase(key)] = obj[key];
  }
  return result;
}

// Convert object keys from snake_case to camelCase
function keysToCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    result[toCamelCase(key)] = obj[key];
  }
  return result;
}

async function executeQuery<T = Record<string, unknown>>(
  sql: string, 
  params: unknown[] = []
): Promise<{ results: T[]; changes?: number }> {
  const response = await fetch(D1_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 API error: ${response.status} - ${text}`);
  }

  const data = await response.json() as D1Response<T>;
  
  if (!data.success) {
    throw new Error(`D1 query failed: ${data.errors.map(e => e.message).join(', ')}`);
  }

  return {
    results: data.result[0]?.results || [],
    changes: data.result[0]?.meta?.changes,
  };
}

// Build WHERE clause from better-auth's Where array
interface Where {
  field: string;
  value: unknown;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with';
  connector?: 'AND' | 'OR';
}

function buildWhereClause(
  where: Where[], 
  model: string
): { clause: string; params: unknown[] } {
  if (!where || where.length === 0) {
    return { clause: '', params: [] };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const condition of where) {
    // Convert camelCase field to snake_case for D1
    const field = toSnakeCase(condition.field);
    
    if (condition.operator === 'eq' || !condition.operator) {
      conditions.push(`${field} = ?`);
      params.push(condition.value);
    } else if (condition.operator === 'ne') {
      conditions.push(`${field} != ?`);
      params.push(condition.value);
    } else if (condition.operator === 'gt') {
      conditions.push(`${field} > ?`);
      params.push(condition.value);
    } else if (condition.operator === 'gte') {
      conditions.push(`${field} >= ?`);
      params.push(condition.value);
    } else if (condition.operator === 'lt') {
      conditions.push(`${field} < ?`);
      params.push(condition.value);
    } else if (condition.operator === 'lte') {
      conditions.push(`${field} <= ?`);
      params.push(condition.value);
    } else if (condition.operator === 'in') {
      const values = condition.value as unknown[];
      if (values.length === 0) {
        // Empty IN clause - return false condition
        conditions.push('1 = 0');
      } else {
        const placeholders = values.map(() => '?').join(', ');
        conditions.push(`${field} IN (${placeholders})`);
        params.push(...values);
      }
    } else if (condition.operator === 'not_in') {
      const values = condition.value as unknown[];
      if (values.length === 0) {
        // Empty NOT IN clause - return true condition (skip)
        continue;
      }
      const placeholders = values.map(() => '?').join(', ');
      conditions.push(`${field} NOT IN (${placeholders})`);
      params.push(...values);
    } else if (condition.operator === 'contains') {
      conditions.push(`${field} LIKE ?`);
      params.push(`%${condition.value}%`);
    } else if (condition.operator === 'starts_with') {
      conditions.push(`${field} LIKE ?`);
      params.push(`${condition.value}%`);
    } else if (condition.operator === 'ends_with') {
      conditions.push(`${field} LIKE ?`);
      params.push(`%${condition.value}`);
    }
  }

  if (conditions.length === 0) {
    return { clause: '', params: [] };
  }

  return {
    clause: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

// Create the D1 adapter using better-auth's factory pattern
// This adapter handles camelCase <-> snake_case conversion
const d1AdapterFactory = createAdapterFactory({
  config: {
    adapterId: 'd1',
    adapterName: 'D1 Adapter',
    usePlural: false,
    debugLogs: false,
    supportsJSON: false,
    // D1 REST API doesn't support real transactions
    transaction: false,
  },
  adapter: ({ getModelName }) => ({
    async create({ model, data }) {
      const tableName = getModelName(model);
      const record = data as Record<string, unknown>;
      
      // Convert keys to snake_case for D1
      const snakeCaseRecord = keysToSnakeCase(record);
      const columns = Object.keys(snakeCaseRecord);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(snakeCaseRecord);
      
      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      await executeQuery(sql, values);
      
      // Return the created record (fetch it back to get any defaults)
      const id = record.id;
      const { results } = await executeQuery<Record<string, unknown>>(
        `SELECT * FROM ${tableName} WHERE id = ?`,
        [id]
      );
      
      // Convert result back to camelCase
      return (results[0] ? keysToCamelCase(results[0]) : data) as any;
    },

    async findOne({ model, where, select }) {
      const tableName = getModelName(model);
      const { clause, params } = buildWhereClause(where || [], model);
      
      // Convert select columns to snake_case
      const selectColumns = select 
        ? select.map(s => toSnakeCase(s)).join(', ') 
        : '*';
      
      const sql = `SELECT ${selectColumns} FROM ${tableName} ${clause} LIMIT 1`;
      const { results } = await executeQuery<Record<string, unknown>>(sql, params);
      
      // Convert result back to camelCase
      return (results[0] ? keysToCamelCase(results[0]) : null) as any;
    },

    async findMany({ model, where, limit, offset, sortBy }) {
      const tableName = getModelName(model);
      const { clause, params } = buildWhereClause(where || [], model);
      
      let sql = `SELECT * FROM ${tableName} ${clause}`;
      
      if (sortBy) {
        // Convert sort field to snake_case
        const sortField = toSnakeCase(sortBy.field);
        const direction = sortBy.direction === 'desc' ? 'DESC' : 'ASC';
        sql += ` ORDER BY ${sortField} ${direction}`;
      }
      
      if (limit) {
        sql += ` LIMIT ${limit}`;
      }
      
      if (offset) {
        sql += ` OFFSET ${offset}`;
      }
      
      const { results } = await executeQuery<Record<string, unknown>>(sql, params);
      
      // Convert all results back to camelCase
      return results.map(keysToCamelCase) as any;
    },

    async count({ model, where }) {
      const tableName = getModelName(model);
      const { clause, params } = buildWhereClause(where || [], model);
      
      const sql = `SELECT COUNT(*) as count FROM ${tableName} ${clause}`;
      const { results } = await executeQuery<{ count: number }>(sql, params);
      
      return results[0]?.count || 0;
    },

    async update({ model, where, update: updateData }) {
      const tableName = getModelName(model);
      const { clause, params: whereParams } = buildWhereClause(where, model);
      
      // Convert update data to snake_case
      const snakeCaseUpdate = keysToSnakeCase(updateData as Record<string, unknown>);
      const setClause = Object.keys(snakeCaseUpdate)
        .map(key => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(snakeCaseUpdate), ...whereParams];
      
      const sql = `UPDATE ${tableName} SET ${setClause} ${clause}`;
      await executeQuery(sql, values);
      
      // Return the updated record
      const { results } = await executeQuery<Record<string, unknown>>(
        `SELECT * FROM ${tableName} ${clause}`,
        whereParams
      );
      
      // Convert result back to camelCase
      return (results[0] ? keysToCamelCase(results[0]) : null) as any;
    },

    async updateMany({ model, where, update: updateData }) {
      const tableName = getModelName(model);
      const { clause, params: whereParams } = buildWhereClause(where, model);
      
      // Convert update data to snake_case
      const snakeCaseUpdate = keysToSnakeCase(updateData as Record<string, unknown>);
      const setClause = Object.keys(snakeCaseUpdate)
        .map(key => `${key} = ?`)
        .join(', ');
      const values = [...Object.values(snakeCaseUpdate), ...whereParams];
      
      const sql = `UPDATE ${tableName} SET ${setClause} ${clause}`;
      const { changes } = await executeQuery(sql, values);
      
      return changes || 0;
    },

    async delete({ model, where }) {
      const tableName = getModelName(model);
      const { clause, params } = buildWhereClause(where, model);
      
      await executeQuery(`DELETE FROM ${tableName} ${clause}`, params);
    },

    async deleteMany({ model, where }) {
      const tableName = getModelName(model);
      const { clause, params } = buildWhereClause(where, model);
      
      const sql = `DELETE FROM ${tableName} ${clause}`;
      const { changes } = await executeQuery(sql, params);
      
      return changes || 0;
    },
  }),
});

// Export the adapter factory function that better-auth expects
export const d1Adapter = (options?: BetterAuthOptions) => {
  return d1AdapterFactory(options || {} as BetterAuthOptions);
};
