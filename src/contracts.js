import { z } from 'zod';

export const MAX_JSON_BYTES = 32 * 1024 * 1024;
export const assetSchema = z.object({
  id: z.string().regex(/^image-[1-9]\d{0,2}$/),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  data: z.string().max(5_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
}).strict();
export const documentSchema = z.object({
  filename: z.string().min(1).max(240),
  format: z.enum(['docx', 'pdf', 'markdown', 'text']),
  html: z.string().min(1).max(10_000_000),
  markdown: z.string().min(1).max(1_000_000),
  warnings: z.array(z.string().max(4000)).max(500),
  assets: z.array(assetSchema).max(30),
  pageCount: z.number().int().min(1).max(150).nullable(),
}).strict().refine(doc => doc.assets.reduce((n, a) => n + a.data.length, 0) <= 5_000_000, 'The total image budget is five million base64 characters.')
  .refine(doc => new Set(doc.assets.map(a => a.id)).size === doc.assets.length, 'Figure names must be unique.');
export const commentSchema = z.object({
  text_snippet: z.string().min(1).max(4000), content: z.string().min(1).max(6000),
  severity: z.enum(['major', 'minor', 'suggestion']),
  reviewer: z.enum(['Technical Reviewer', 'Editorial Reviewer', 'Reference Checker']),
  occurrence: z.number().int().min(1).max(1_000_000).optional(),
}).strict();
export const commentsSchema = z.array(commentSchema).max(200);
export const documentIdSchema = z.string().regex(/^[a-f0-9]{48}$/);
const status = z.enum(['complete', 'limited', 'skipped', 'failed']);
export const reviewShape = {
  document_id: documentIdSchema,
  summary: z.string().min(1).max(15000), comments: commentsSchema,
  coverage: z.object({ technical: status, editorial: status, references: status }).strict(),
  limitations: z.array(z.string().min(1).max(2000)).max(30),
};
export const exportSchema = z.object(reviewShape).strict();
export const validationSchema = z.object({ document_id: documentIdSchema, comments: commentsSchema }).strict();

export function parseInput(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Do not echo manuscript content into diagnostics.
    throw Object.assign(new Error(`Invalid request field: ${result.error.issues[0].path.join('.') || 'body'}. Check the documented schema.`), { status: 400 });
  }
  return result.data;
}
