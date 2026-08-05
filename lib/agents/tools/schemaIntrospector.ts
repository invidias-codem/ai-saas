import { z } from 'zod';
import type { Tool } from '@/lib/agents/core/types';
import { supabaseAdmin } from '@/lib/supabaseClient';

interface ColumnMeta {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

function mapPgTypeToZod(dataType: string): z.ZodTypeAny {
  switch (dataType) {
    case 'uuid':
      return z.string().uuid();
    case 'integer':
    case 'bigint':
    case 'numeric':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'jsonb':
    case 'json':
      return z.record(z.any());
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'date':
      return z.string().datetime().or(z.string());
    default:
      return z.string();
  }
}

function inferRisk(table: string, columns: ColumnMeta[]): 'read-only' | 'analysis' | 'mutative' {
  const sensitiveCols = ['token', 'secret', 'password', 'key', 'audit_log', 'role', 'permissions'];
  const hasSensitive = columns.some(c => sensitiveCols.includes(c.column_name));
  if (hasSensitive) return 'mutative';

  const mutableTables = ['workspace_memories', 'organization_members', 'audit_log'];
  if (mutableTables.includes(table)) return 'mutative';

  return 'analysis';
}

function buildDescription(table: string, operation: 'insert' | 'update' | 'select', columns: ColumnMeta[]): string {
  const colList = columns.map(c => c.column_name).join(', ');
  return `Auto-generated ${operation} operation on table '${table}'. Columns: ${colList}.`;
}

function buildZodSchema(columns: ColumnMeta[], excludeDefaults = true): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const col of columns) {
    if (excludeDefaults && ['id', 'created_at', 'updated_at'].includes(col.column_name)) continue;
    let fieldSchema = mapPgTypeToZod(col.data_type);
    if (col.is_nullable === 'YES') {
      fieldSchema = fieldSchema.optional();
    }
    shape[col.column_name] = fieldSchema;
  }
  return z.object(shape);
}

export async function introspectDatabaseTools(targetTables: string[]): Promise<Tool[]> {
  if (!supabaseAdmin) return [];
  const admin = supabaseAdmin;
  const generatedTools: Tool[] = [];

  for (const table of targetTables) {
    const { data: columns, error } = (await admin.rpc('get_table_columns_meta', {
      target_table: table,
    })) as { data: ColumnMeta[] | null; error: any };

    if (error || !columns || columns.length === 0) continue;

    const insertSchema = buildZodSchema(columns);
    const updateSchema = buildZodSchema(columns, false);
    const risk = inferRisk(table, columns);

    generatedTools.push({
      name: `auto_db_insert_${table}`,
      description: buildDescription(table, 'insert', columns),
      schema: insertSchema,
      risk,
      requiresApproval: risk === 'mutative',
      timeoutMs: 10000,
      execute: async (args: Record<string, any>, _context: any) => {
        const { data, error: insertError } = await admin
          .from(table)
          .insert(args)
          .select()
          .single();

        if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);
        return data;
      },
    });

    generatedTools.push({
      name: `auto_db_update_${table}`,
      description: buildDescription(table, 'update', columns),
      schema: z.object({
        id: z.string().uuid(),
        updates: updateSchema,
      }),
      risk,
      requiresApproval: risk === 'mutative',
      timeoutMs: 10000,
      execute: async (input: { id: string; updates: Record<string, any> }, _context: any) => {
        const { data, error: updateError } = await admin
          .from(table)
          .update(input.updates)
          .eq('id', input.id)
          .select()
          .single();

        if (updateError) throw new Error(`Database Update Failed: ${updateError.message}`);
        return data;
      },
    });

    generatedTools.push({
      name: `auto_db_select_${table}`,
      description: buildDescription(table, 'select', columns),
      schema: z.object({
        limit: z.number().int().positive().max(100).default(20).optional(),
      }),
      risk: 'read-only',
      requiresApproval: false,
      timeoutMs: 10000,
      execute: async (input: { limit?: number }, _context: any) => {
        const { data, error: selectError } = await admin
          .from(table)
          .select('*')
          .limit(input?.limit ?? 20);

        if (selectError) throw new Error(`Database Select Failed: ${selectError.message}`);
        return data ?? [];
      },
    });
  }

  return generatedTools;
}
