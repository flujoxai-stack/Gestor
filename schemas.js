/**
 * schemas.js — Validación de entrada (SEC-04)
 *
 * Antes, cada ruta de server.js tomaba los campos de req.body tal cual
 * llegaban, sin comprobar tipo, longitud ni valores permitidos. Estos
 * esquemas son la única puerta de entrada: si algo no encaja, la petición
 * se rechaza con 400 antes de tocar la base de datos.
 */
const { z } = require('zod');

const idLike = z.union([z.string(), z.number()]).transform(String);
const dateLike = z.string().trim().max(40).optional().default('');
const hexColor = z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color inválido (usa formato hex, ej. #6e48c1)');

const projectSchema = z.object({
    id: idLike.optional(),
    name: z.string().trim().min(1, 'El nombre del proyecto es requerido').max(200),
    status: z.enum(['lead', 'negotiation', 'execution', 'delivered']).optional().default('lead'),
    start_date: dateLike,
    end_date: dateLike,
    warranty_start: dateLike,
    warranty_end: dateLike,
});

const taskCreateSchema = z.object({
    id: idLike.optional(),
    project_id: idLike,
    title: z.string().trim().min(1, 'El título de la tarea es requerido').max(200),
    description: z.string().max(5000).optional().default(''),
    status: z.enum(['todo', 'inprogress', 'done', 'paused']).optional().default('todo'),
    priority: z.enum(['Baja', 'Media', 'Alta']).optional().default('Media'),
    due_date: dateLike,
});

const taskUpdateSchema = z.object({
    title: z.string().trim().min(1, 'El título de la tarea es requerido').max(200),
    description: z.string().max(5000).optional().default(''),
    status: z.enum(['todo', 'inprogress', 'done', 'paused']).optional().default('todo'),
    priority: z.enum(['Baja', 'Media', 'Alta']).optional().default('Media'),
    due_date: dateLike,
});

const financeSchema = z.object({
    id: idLike.optional(),
    concept: z.string().trim().min(1, 'El concepto es requerido').max(200),
    type: z.enum(['income', 'expense']),
    amount: z.coerce.number().finite('El monto debe ser un número').refine((n) => n > 0, 'El monto debe ser mayor a 0'),
    date: z.string().trim().min(1, 'La fecha es requerida').max(40),
    project_id: idLike.nullish().transform((v) => v || null),
});

const activitySchema = z.object({
    id: idLike.optional(),
    title: z.string().trim().min(1).max(200),
    desc: z.string().max(2000).optional().default(''),
    date: z.string().trim().min(1).max(40),
});

const noteSchema = z.object({
    id: idLike.optional(),
    title: z.string().trim().min(1, 'El título de la nota es requerido').max(200),
    content: z.string().max(20000).optional().default(''),
    folder: z.string().trim().max(100).optional().default('General'),
    color: hexColor.optional().default('#ffffff'),
    created_at: z.string().max(40).optional(),
});

const noteUpdateSchema = noteSchema.partial({ title: false }).extend({
    title: z.string().trim().min(1, 'El título de la nota es requerido').max(200),
});

const folderSchema = z.object({
    name: z.string().trim().min(1, 'El nombre de la carpeta es requerido').max(100),
    color: hexColor.optional(),
});

const settingSchema = z.object({
    key: z.string().trim().min(1).max(100),
    value: z.union([z.string(), z.number(), z.boolean()]).transform(String).refine((v) => v.length <= 50000, 'Valor demasiado largo'),
});

const integrationEventName = z.string().trim().min(1).max(100);

const integrationSchema = z.object({
    id: idLike.optional(),
    name: z.string().trim().min(1, 'El nombre de la integración es requerido').max(200),
    type: z.enum(['webhook', 'zapier', 'make', 'n8n', 'custom']).optional().default('webhook'),
    endpoint: z.string().trim().url('El endpoint debe ser una URL válida (https://...)').max(2000),
    secret: z.string().max(500).optional().default(''),
    enabled: z.coerce.boolean().optional().default(true),
    events: z.array(integrationEventName).max(30).optional().default(['all']),
    headers: z.record(z.string().max(200), z.string().max(2000)).optional().default({}),
    method: z.enum(['POST', 'PUT', 'GET']).optional().default('POST'),
});

const businessNotificationUpdateSchema = z.object({
    is_read: z.coerce.boolean().optional(),
    label: z.string().trim().max(100).optional(),
    notes: z.string().max(5000).optional(),
});

// El webhook entrante de n8n reenvía correos reales: el contenido es
// hostil por definición, pero al menos acotamos tamaños y tipos.
const businessEmailWebhookSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    message_id: z.union([z.string(), z.number()]).optional(),
    source: z.string().max(50).optional(),
    label: z.string().max(50).optional(),
    from_name: z.string().max(300).optional(),
    from_email: z.string().max(300).optional(),
    from: z.string().max(300).optional(),
    subject: z.string().max(1000).optional(),
    snippet: z.string().max(3000).optional(),
    body: z.string().max(50000).optional(),
    thread_id: z.union([z.string(), z.number()]).optional(),
    url: z.string().max(2000).optional(),
    metadata: z.any().optional(),
    received_at: z.string().max(60).optional(),
    date: z.string().max(60).optional(),
});

module.exports = {
    projectSchema,
    taskCreateSchema,
    taskUpdateSchema,
    financeSchema,
    activitySchema,
    noteSchema,
    noteUpdateSchema,
    folderSchema,
    settingSchema,
    integrationSchema,
    businessNotificationUpdateSchema,
    businessEmailWebhookSchema,
};
