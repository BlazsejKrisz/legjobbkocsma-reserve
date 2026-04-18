import { z } from 'zod'

export const TABLE_TYPE_CODES = ['standard', 'billiard', 'darts', 'vip', 'other'] as const

export const UpsertTableTypeSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.enum(TABLE_TYPE_CODES),
  is_active: z.boolean().default(true),
})
export type UpsertTableTypePayload = z.infer<typeof UpsertTableTypeSchema>

export const UpsertTableSchema = z.object({
  name: z.string().min(1).max(80),
  table_type_id: z.string().min(1).nullable().optional(),
  area: z.string().max(80).nullable().optional(),
  capacity_min: z.number().int().min(1),
  capacity_max: z.number().int().min(1),
  sort_order: z.number().int().min(1),
  blend_group: z.string().max(80).nullable().optional(),
  can_blend: z.boolean().default(false),
  is_active: z.boolean().default(true),
  map_x: z.number().nullable().optional(),
  map_y: z.number().nullable().optional(),
})
export type UpsertTablePayload = z.infer<typeof UpsertTableSchema>

export const ReorderTablesSchema = z.object({
  order: z.array(z.object({ id: z.string().min(1), sort_order: z.number().int().min(1) })),
})
export type ReorderTablesPayload = z.infer<typeof ReorderTablesSchema>
