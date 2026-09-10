const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const {
    selectRows,
    selectOneRow,
    insertRow,
    upsertRow,
    updateRows,
    deleteRows,
} = require('./database');
const {
    projectSchema,
    companySchema,
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
} = require('./schemas');
const { assertPublicWebhookUrl } = require('./security');

// SEC-04: valida req.body contra un esquema Zod antes de tocar la base de
// datos. Si no encaja, responde 400 con el detalle de qué campo falló.
function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
            });
        }
        req.body = result.data;
        next();
    };
}

const app = express();
// Vercel pone la app detrás de su propio proxy: sin esto, express-rate-limit
// (usado en /api/auth/login) revienta con un 500 crudo al ver la cabecera
// X-Forwarded-For sin "trust proxy" configurado -- justo lo que le pasaba
// a Kevin al intentar entrar con una contraseña que sí era correcta.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_AUTH_KEY =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
const AUTH_ALLOWED_EMAILS = (process.env.AUTH_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
const AUTH_FALLBACK_EMAIL = 'flujoxai@gmail.com';
const N8N_WEBHOOK_SECRET = (process.env.N8N_WEBHOOK_SECRET || '').trim();
// MULTI-01: el webhook de n8n no tiene un usuario logueado detrás (lo llama
// n8n directamente con un secreto compartido), así que no hay forma de
// deducir de quién es el correo entrante. Como solo el dueño principal
// tiene su Gmail conectado a ese flujo, se le asigna a este ID fijo -- el
// UUID de auth.users del dueño (Authentication > Users en Supabase, o
// "select id from auth.users where email = '...'" en el SQL Editor).
const N8N_WEBHOOK_OWNER_ID = (process.env.N8N_WEBHOOK_OWNER_ID || '').trim();
if (AUTH_ALLOWED_EMAILS.length === 0) {
    AUTH_ALLOWED_EMAILS.push(AUTH_FALLBACK_EMAIL);
}
const INTEGRATION_DEFAULT_EVENTS = ['project.created', 'project.updated', 'project.deleted', 'task.created', 'task.updated', 'task.deleted', 'finance.created', 'finance.deleted', 'note.created', 'note.updated', 'note.deleted', 'folder.created', 'company.created', 'company.updated', 'company.deleted', 'business.email.received'];
const DEFAULT_NOTE_FOLDERS = ['General', 'APIs', 'Contraseñas'];

// SEC-07: antes cors() sin opciones respondía Access-Control-Allow-Origin: *
// para toda la API. Esta app la usan pocas personas autorizadas desde un
// puñado de dominios propios, así que se restringe a esos (+ localhost en
// desarrollo). BUG encontrado: faltaba el dominio propio gestor.flujoxai.com
// en esta lista -- cualquier POST/PUT/DELETE real desde el navegador en ese
// dominio (login incluido) mandaba el header Origin, no coincidía con nada
// de la lista, y el callback(new Error(...)) de abajo tumbaba el servidor
// entero con un 500 crudo en vez de solo rechazar esa petición.
const ALLOWED_ORIGINS = [
    'https://gestor-flame.vercel.app',
    'https://gestor.flujoxai.com',
    ...(process.env.EXTRA_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
];
app.use(cors({
    origin(origin, callback) {
        // Sin header Origin (curl, apps nativas, misma-origen) o localhost: permitir.
        if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin) || ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        // callback(null, false) en vez de callback(new Error(...)): un origen
        // no reconocido simplemente no recibe los headers CORS (el navegador
        // bloquea la respuesta del lado del cliente), en vez de tumbar el
        // servidor completo con una excepción sin capturar.
        return callback(null, false);
    },
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function requireAuth(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    if (req.path === '/auth/login') return next();

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                apikey: SUPABASE_AUTH_KEY,
                Authorization: `Bearer ${token}`,
            },
        });

        if (!authRes.ok) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await authRes.json();
        const email = String(user.email || '').toLowerCase();

        if (AUTH_ALLOWED_EMAILS.length > 0 && !AUTH_ALLOWED_EMAILS.includes(email)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // MULTI-01: cada usuario autorizado ve solo lo suyo. req.user.id es
        // el UUID real de Supabase Auth -- toda ruta de abajo filtra por
        // este valor, nunca por uno que venga del body/query del cliente.
        req.user = user;
        req.ownerId = user.id;
        return next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

app.use('/api', requireAuth);

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 10, // 10 intentos por IP en la ventana
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' },
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        if (AUTH_ALLOWED_EMAILS.length > 0 && !AUTH_ALLOWED_EMAILS.includes(email)) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_AUTH_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const payload = await loginRes.json().catch(() => ({}));

        if (!loginRes.ok) {
            // Supabase GoTrue no siempre usa "msg"/"message" -- errores como
            // el de correo sin confirmar vienen en "error_description", y
            // sin esto el usuario solo veía el mensaje genérico de abajo
            // sin pista real de qué estaba pasando.
            return res.status(loginRes.status).json({
                error: payload?.msg || payload?.message || payload?.error_description || 'No se pudo iniciar sesión',
            });
        }

        const userEmail = String(payload?.user?.email || '').toLowerCase();
        if (AUTH_ALLOWED_EMAILS.length > 0 && !AUTH_ALLOWED_EMAILS.includes(userEmail)) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        return res.json(payload);
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        return res.json({ user: req.user || null });
    } catch (err) {
        return res.status(500).json({ error: 'Auth check failed' });
    }
});

async function getProjectsWithTasks(ownerId) {
    const projects = await selectRows('projects', { filters: { owner_id: ownerId }, order: 'pipeline_order.asc' });
    const tasks = await selectRows('tasks', { filters: { owner_id: ownerId } });
    return projects.map((project) => ({
        ...project,
        tasks: tasks
            .filter((task) => task.project_id === project.id)
            .map((task) => ({
                ...task,
                dueDate: task.due_date,
            })),
    }));
}

// MULTI-01: antes de crear una tarea o un movimiento financiero atado a un
// project_id, hay que confirmar que ese proyecto es del mismo dueño --
// si no, cualquier usuario autorizado podría "adivinar" el id de un
// proyecto ajeno y colgarle tareas o gastos.
async function assertProjectOwnership(projectId, ownerId) {
    if (!projectId) return true;
    const project = await selectOneRow('projects', { filters: { id: projectId, owner_id: ownerId }, columns: 'id' });
    return !!project;
}

function parseJson(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function integrationNow() {
    return new Date().toISOString();
}

function normalizeIntegration(row) {
    const config = parseJson(row.config, {});
    const events = Array.isArray(config.events)
        ? config.events
        : String(config.events || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    return {
        ...row,
        enabled: row.enabled === true || row.enabled === 1 || row.enabled === '1' || row.enabled === 'true',
        config,
        endpoint: config.endpoint || '',
        secret: config.secret || '',
        method: config.method || 'POST',
        events: events.length ? events : ['all'],
        headers: config.headers && typeof config.headers === 'object' ? config.headers : {},
    };
}

async function getIntegrations(ownerId) {
    const rows = await selectRows('integrations', { filters: { owner_id: ownerId }, order: 'updated_at.desc' });
    return rows.map(normalizeIntegration);
}

function normalizeBusinessNotification(row) {
    const metadata = parseJson(row.metadata, {});
    return {
        ...row,
        is_read: row.is_read === true || row.is_read === 1 || row.is_read === '1' || row.is_read === 'true',
        metadata,
    };
}

async function getBusinessNotifications(ownerId, limit = 50) {
    const rows = await selectRows('business_notifications', { filters: { owner_id: ownerId }, order: 'received_at.desc', limit });
    return rows.map(normalizeBusinessNotification);
}

function integrationMatchesEvent(integration, eventType) {
    const events = integration.events || [];
    return events.includes('all') || events.includes(eventType) || events.some((event) => eventType.startsWith(`${event}.`));
}

async function logIntegrationEvent(data) {
    try {
        await insertRow('integration_events', data);
    } catch (err) {
        console.error('Error logging integration event:', err);
    }
}

async function emitIntegrationEvent(ownerId, eventType, payload, meta = {}) {
    let integrations = [];
    try {
        integrations = await getIntegrations(ownerId);
    } catch (err) {
        console.error('Error loading integrations:', err);
        return;
    }

    const body = {
        event: eventType,
        source: 'gestorpro',
        created_at: integrationNow(),
        payload,
        meta,
    };
    const rawBody = JSON.stringify(body);

    await Promise.allSettled(
        integrations
            .filter((integration) => integration.enabled && integration.endpoint && integrationMatchesEvent(integration, eventType))
            .map(async (integration) => {
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Gestor-Event': eventType,
                    'X-Gestor-Source': 'gestorpro',
                    'X-Gestor-Integration': String(integration.id),
                    ...integration.headers,
                };
                if (integration.secret) {
                    headers['X-Gestor-Signature'] = `sha256=${crypto
                        .createHmac('sha256', integration.secret)
                        .update(rawBody)
                        .digest('hex')}`;
                }
                let status = 'sent';
                let responseText = '';
                try {
                    // SEC-05: revalidar en el momento del envío, no solo al guardar
                    // (el DNS del endpoint pudo cambiar después de crear la integración).
                    await assertPublicWebhookUrl(integration.endpoint);
                    const response = await fetch(integration.endpoint, {
                        method: integration.method || 'POST',
                        headers,
                        body: rawBody,
                    });
                    responseText = await response.text();
                    status = response.ok ? 'success' : `http_${response.status}`;
                } catch (err) {
                    status = 'failed';
                    responseText = err.message;
                }
                await logIntegrationEvent({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    owner_id: ownerId,
                    integration_id: String(integration.id),
                    event_type: eventType,
                    payload: rawBody,
                    status,
                    response: responseText,
                    created_at: integrationNow(),
                });
            })
    );
}

// MULTI-01: la primera vez que un usuario nuevo (recién invitado) entra al
// CRM todavía no tiene carpetas de notas -- antes eran filas globales
// sembradas una sola vez en toda la base de datos; ahora cada usuario
// necesita las suyas la primera vez que carga /api/state.
async function ensureDefaultFolders(ownerId) {
    const existing = await selectRows('note_folders', { filters: { owner_id: ownerId }, columns: 'name' });
    if (existing.length > 0) return existing.map((f) => f.name);

    for (const name of DEFAULT_NOTE_FOLDERS) {
        await upsertRow('note_folders', { owner_id: ownerId, name }, 'owner_id,name');
    }
    return DEFAULT_NOTE_FOLDERS.slice();
}

app.get('/api/state', async (req, res) => {
    try {
        const ownerId = req.ownerId;
        const safeRows = async (loader, fallback = []) => {
            try {
                return await loader();
            } catch (err) {
                console.warn('Estado parcial: no se pudo cargar un bloque del CRM:', err.message);
                return fallback;
            }
        };

        const companies = await safeRows(() => selectRows('companies', { filters: { owner_id: ownerId }, order: 'created_at.desc' }), []);
        const projects = await safeRows(() => getProjectsWithTasks(ownerId), []);
        const finances = await safeRows(() => selectRows('finances', { filters: { owner_id: ownerId }, order: 'date.desc' }), []);
        const activities = await safeRows(() => selectRows('activities', { filters: { owner_id: ownerId }, order: 'date.desc', limit: 50 }), []);
        const notes = await safeRows(() => selectRows('notes', { filters: { owner_id: ownerId }, order: 'created_at.desc' }), []);
        const folderNames = await safeRows(() => ensureDefaultFolders(ownerId), DEFAULT_NOTE_FOLDERS.slice());
        const timeSetting = await safeRows(
            () => selectOneRow('settings', { filters: { owner_id: ownerId, key: 'globalTimeSpent' } }),
            null
        );
        const folderColorsSetting = await safeRows(
            () => selectOneRow('settings', { filters: { owner_id: ownerId, key: 'noteFolderColors' } }),
            null
        );
        const businessNotifications = await safeRows(() => getBusinessNotifications(ownerId, 50), []);
        const integrations = await safeRows(() => getIntegrations(ownerId), []);
        const integrationEvents = await safeRows(
            () => selectRows('integration_events', { filters: { owner_id: ownerId }, order: 'created_at.desc', limit: 20 }),
            []
        );
        let noteFolderColors = {};
        if (folderColorsSetting && folderColorsSetting.value) {
            try {
                noteFolderColors = JSON.parse(folderColorsSetting.value) || {};
            } catch {
                noteFolderColors = {};
            }
        }

        res.json({
            companies,
            projects,
            currentProjectId: projects.length > 0 ? projects[0].id : null,
            finances,
            activities,
            notes,
            noteFolders: folderNames,
            noteFolderColors,
            integrations,
            integrationEvents,
            businessNotifications,
            globalTimeSpent: timeSetting ? parseInt(timeSetting.value, 10) || 0 : 0,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const rows = await selectRows('projects', { filters: { owner_id: req.ownerId }, order: 'pipeline_order.asc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', validateBody(projectSchema), async (req, res) => {
    const { id, name, status, start_date, end_date, warranty_start, warranty_end, company_id } = req.body;
    try {
        const existing = await selectRows('projects', { filters: { owner_id: req.ownerId }, columns: 'id' });
        const projectRecord = {
            id,
            owner_id: req.ownerId,
            name,
            status: status || 'lead',
            start_date: start_date || '',
            end_date: end_date || '',
            warranty_start: warranty_start || '',
            warranty_end: warranty_end || '',
            pipeline_order: existing.length,
            company_id: company_id ?? null,
        };
        await upsertRow(
            'projects',
            projectRecord,
            'id'
        );
        void emitIntegrationEvent(req.ownerId, 'project.created', { project: projectRecord, source: 'projects' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', validateBody(projectSchema), async (req, res) => {
    const { name, status, start_date, end_date, warranty_start, warranty_end, company_id } = req.body;
    try {
        const updateData = { name, status, start_date, end_date, warranty_start, warranty_end };
        // company_id solo se toca si vino explícito en el body -- guardar
        // solo la garantía (u otro campo parcial) nunca debe desvincular
        // la empresa del proyecto sin que el usuario lo haya pedido.
        if (company_id !== undefined) updateData.company_id = company_id;
        await updateRows('projects', { id: req.params.id, owner_id: req.ownerId }, updateData);
        void emitIntegrationEvent(req.ownerId, 'project.updated', { project: { id: req.params.id, ...updateData }, source: 'projects' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        await deleteRows('tasks', { project_id: req.params.id, owner_id: req.ownerId });
        await deleteRows('projects', { id: req.params.id, owner_id: req.ownerId });
        void emitIntegrationEvent(req.ownerId, 'project.deleted', { project: { id: req.params.id }, source: 'projects' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/companies', async (req, res) => {
    try {
        const rows = await selectRows('companies', { filters: { owner_id: req.ownerId }, order: 'created_at.desc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/companies', validateBody(companySchema), async (req, res) => {
    const { id, name, status, projected_amount, projected_notes, activity_log } = req.body;
    try {
        const record = {
            id,
            owner_id: req.ownerId,
            name,
            status: status || 'active',
            projected_amount: projected_amount || 0,
            projected_notes: projected_notes || '',
            activity_log: activity_log || '[]',
            created_at: integrationNow(),
        };
        await upsertRow('companies', record, 'id');
        void emitIntegrationEvent(req.ownerId, 'company.created', { company: record, source: 'companies' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/companies/:id', validateBody(companySchema), async (req, res) => {
    const { name, status, projected_amount, projected_notes, activity_log } = req.body;
    try {
        const updateData = { name, status, projected_amount, projected_notes, activity_log };
        await updateRows('companies', { id: req.params.id, owner_id: req.ownerId }, updateData);
        void emitIntegrationEvent(req.ownerId, 'company.updated', { company: { id: req.params.id, ...updateData }, source: 'companies' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/companies/:id', async (req, res) => {
    try {
        // El FK projects.company_id tiene "on delete set null": los
        // proyectos de esta empresa no se borran, solo quedan sin empresa.
        await deleteRows('companies', { id: req.params.id, owner_id: req.ownerId });
        void emitIntegrationEvent(req.ownerId, 'company.deleted', { company: { id: req.params.id }, source: 'companies' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        const rows = await selectRows('tasks', { filters: { owner_id: req.ownerId } });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', validateBody(taskCreateSchema), async (req, res) => {
    const { id, project_id, title, description, status, priority, due_date } = req.body;
    try {
        if (!(await assertProjectOwnership(project_id, req.ownerId))) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }
        const taskRecord = {
            id,
            owner_id: req.ownerId,
            project_id,
            title,
            description: description || '',
            status: status || 'todo',
            priority: priority || 'Media',
            due_date: due_date || '',
        };
        await upsertRow(
            'tasks',
            taskRecord,
            'id'
        );
        void emitIntegrationEvent(req.ownerId, 'task.created', { task: taskRecord, source: 'tasks' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', validateBody(taskUpdateSchema), async (req, res) => {
    const { title, description, status, priority, due_date } = req.body;
    try {
        const taskRecord = {
            id: req.params.id,
            title,
            description,
            status,
            priority,
            due_date,
        };
        await updateRows(
            'tasks',
            { id: req.params.id, owner_id: req.ownerId },
            { title, description, status, priority, due_date }
        );
        void emitIntegrationEvent(req.ownerId, 'task.updated', { task: taskRecord, source: 'tasks' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await deleteRows('tasks', { id: req.params.id, owner_id: req.ownerId });
        void emitIntegrationEvent(req.ownerId, 'task.deleted', { task: { id: req.params.id }, source: 'tasks' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/finances', async (req, res) => {
    try {
        const rows = await selectRows('finances', { filters: { owner_id: req.ownerId }, order: 'date.desc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/finances', validateBody(financeSchema), async (req, res) => {
    const { id, concept, type, amount, date, project_id } = req.body;
    try {
        if (project_id && !(await assertProjectOwnership(project_id, req.ownerId))) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }
        const financeRecord = {
            id,
            owner_id: req.ownerId,
            concept,
            type,
            amount,
            date,
            project_id: project_id || null,
        };
        await upsertRow(
            'finances',
            financeRecord,
            'id'
        );
        void emitIntegrationEvent(req.ownerId, 'finance.created', { finance: financeRecord, source: 'finances' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/finances/:id', async (req, res) => {
    try {
        await deleteRows('finances', { id: req.params.id, owner_id: req.ownerId });
        void emitIntegrationEvent(req.ownerId, 'finance.deleted', { finance: { id: req.params.id }, source: 'finances' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/activities', async (req, res) => {
    try {
        const rows = await selectRows('activities', { filters: { owner_id: req.ownerId }, order: 'date.desc', limit: 50 });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/activities', validateBody(activitySchema), async (req, res) => {
    const { id, title, desc, date } = req.body;
    try {
        await upsertRow(
            'activities',
            {
                id,
                owner_id: req.ownerId,
                title,
                desc: desc || '',
                date,
            },
            'id'
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notes', async (req, res) => {
    try {
        const rows = await selectRows('notes', { filters: { owner_id: req.ownerId }, order: 'created_at.desc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notes', validateBody(noteSchema), async (req, res) => {
    const { id, title, content, folder, color, created_at } = req.body;
    try {
        const noteRecord = {
            id,
            owner_id: req.ownerId,
            title,
            content: content || '',
            folder: folder || 'General',
            color: color || '#ffffff',
            created_at,
        };
        await upsertRow(
            'notes',
            noteRecord,
            'id'
        );
        void emitIntegrationEvent(req.ownerId, 'note.created', { note: noteRecord, source: 'notes' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notes/:id', validateBody(noteUpdateSchema), async (req, res) => {
    const { title, content, folder, color } = req.body;
    try {
        const noteRecord = {
            id: req.params.id,
            title,
            content,
            folder,
            color,
        };
        await updateRows(
            'notes',
            { id: req.params.id, owner_id: req.ownerId },
            { title, content, folder, color }
        );
        void emitIntegrationEvent(req.ownerId, 'note.updated', { note: noteRecord, source: 'notes' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await deleteRows('notes', { id: req.params.id, owner_id: req.ownerId });
        void emitIntegrationEvent(req.ownerId, 'note.deleted', { note: { id: req.params.id }, source: 'notes' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/folders', async (req, res) => {
    try {
        const rows = await selectRows('note_folders', { filters: { owner_id: req.ownerId }, columns: 'name' });
        res.json(rows.map((r) => r.name));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/folders', validateBody(folderSchema), async (req, res) => {
    const { name, color } = req.body;
    try {
        await upsertRow(
            'note_folders',
            {
                owner_id: req.ownerId,
                name,
            },
            'owner_id,name'
        );
        if (name && color) {
            const current = await selectOneRow('settings', { filters: { owner_id: req.ownerId, key: 'noteFolderColors' } });
            let colors = {};
            if (current && current.value) {
                try {
                    colors = JSON.parse(current.value) || {};
                } catch {
                    colors = {};
                }
            }
            colors[name] = color;
            await upsertRow('settings', { owner_id: req.ownerId, key: 'noteFolderColors', value: JSON.stringify(colors) }, 'owner_id,key');
        }
        void emitIntegrationEvent(req.ownerId, 'folder.created', { folder: { name, color: color || null }, source: 'folders' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/:key', async (req, res) => {
    try {
        const row = await selectOneRow('settings', { filters: { owner_id: req.ownerId, key: req.params.key } });
        res.json({ value: row ? row.value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', validateBody(settingSchema), async (req, res) => {
    const { key, value } = req.body;
    try {
        await upsertRow(
            'settings',
            {
                owner_id: req.ownerId,
                key,
                value: String(value),
            },
            'owner_id,key'
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/integrations', async (req, res) => {
    try {
        const rows = await getIntegrations(req.ownerId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/integration-events', async (req, res) => {
    try {
        const rows = await selectRows('integration_events', { filters: { owner_id: req.ownerId }, order: 'created_at.desc', limit: 50 });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/integrations', validateBody(integrationSchema), async (req, res) => {
    const { id, name, type, endpoint, secret, enabled, events, headers, method } = req.body;
    try {
        await assertPublicWebhookUrl(endpoint);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
    try {
        const now = integrationNow();
        const record = {
            id: id || `${Date.now()}`,
            owner_id: req.ownerId,
            name,
            type,
            enabled,
            config: JSON.stringify({ endpoint, secret, method, events, headers }),
            created_at: now,
            updated_at: now,
        };
        await upsertRow('integrations', record, 'id');
        res.json({ success: true, id: record.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/integrations/:id', validateBody(integrationSchema), async (req, res) => {
    const { name, type, endpoint, secret, enabled, events, headers, method } = req.body;
    try {
        await assertPublicWebhookUrl(endpoint);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
    try {
        await updateRows(
            'integrations',
            { id: req.params.id, owner_id: req.ownerId },
            {
                name,
                type,
                enabled,
                config: JSON.stringify({ endpoint, secret, method, events, headers }),
                updated_at: integrationNow(),
            }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/integrations/:id', async (req, res) => {
    try {
        await deleteRows('integrations', { id: req.params.id, owner_id: req.ownerId });
        await deleteRows('integration_events', { integration_id: req.params.id, owner_id: req.ownerId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/integrations/:id/test', async (req, res) => {
    try {
        const integration = await selectOneRow('integrations', { filters: { id: req.params.id, owner_id: req.ownerId } });
        if (!integration) {
            return res.status(404).json({ error: 'Integration not found' });
        }
        const normalized = normalizeIntegration(integration);
        const result = await Promise.race([
            (async () => {
                const payload = JSON.stringify({
                    event: 'integration.test',
                    source: 'gestorpro',
                    created_at: integrationNow(),
                    payload: {
                        message: 'Prueba de integración desde GestorPro',
                    },
                });
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Gestor-Event': 'integration.test',
                    'X-Gestor-Source': 'gestorpro',
                    'X-Gestor-Integration': String(normalized.id),
                    ...normalized.headers,
                };
                if (normalized.secret) {
                    headers['X-Gestor-Signature'] = `sha256=${crypto
                        .createHmac('sha256', normalized.secret)
                        .update(payload)
                        .digest('hex')}`;
                }
                await assertPublicWebhookUrl(normalized.endpoint);
                const response = await fetch(normalized.endpoint, {
                    method: normalized.method || 'POST',
                    headers,
                    body: payload,
                });
                const text = await response.text();
                await logIntegrationEvent({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    owner_id: req.ownerId,
                    integration_id: String(normalized.id),
                    event_type: 'integration.test',
                    payload,
                    status: response.ok ? 'success' : `http_${response.status}`,
                    response: text,
                    created_at: integrationNow(),
                });
                return { ok: response.ok, status: response.status, response: text };
            })(),
            new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 15000)),
        ]);

        if (result.timeout) {
            return res.status(504).json({ error: 'Timeout al probar la integración' });
        }
        return res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/business-notifications', async (req, res) => {
    try {
        const rows = await getBusinessNotifications(req.ownerId, 100);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/business-notifications/:id', validateBody(businessNotificationUpdateSchema), async (req, res) => {
    const { is_read, label, notes } = req.body || {};
    try {
        await updateRows(
            'business_notifications',
            { id: req.params.id, owner_id: req.ownerId },
            {
                is_read: is_read === true || is_read === 'true' || is_read === 1 || is_read === '1',
                label,
                notes,
                updated_at: integrationNow(),
            }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/webhooks/n8n/business-email', async (req, res) => {
    try {
        if (!N8N_WEBHOOK_SECRET) {
            console.error('N8N_WEBHOOK_SECRET no está configurado: rechazando webhook entrante por seguridad.');
            return res.status(503).json({ error: 'Webhook no configurado' });
        }
        if (!N8N_WEBHOOK_OWNER_ID) {
            console.error('N8N_WEBHOOK_OWNER_ID no está configurado: no se sabe a qué cuenta pertenece este correo.');
            return res.status(503).json({ error: 'Webhook no configurado (falta owner)' });
        }
        const secretHeader = String(req.headers['x-gestor-webhook-secret'] || '').trim();
        if (!secretHeader || secretHeader !== N8N_WEBHOOK_SECRET) {
            return res.status(401).json({ error: 'Invalid webhook secret' });
        }

        const parsed = businessEmailWebhookSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Payload inválido',
                details: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
            });
        }
        const payload = parsed.data;
        const record = {
            id: String(payload.id || payload.message_id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            owner_id: N8N_WEBHOOK_OWNER_ID,
            source: String(payload.source || 'gmail'),
            label: String(payload.label || 'negocios'),
            from_name: String(payload.from_name || ''),
            from_email: String(payload.from_email || payload.from || ''),
            subject: String(payload.subject || ''),
            snippet: String(payload.snippet || ''),
            body: String(payload.body || ''),
            message_id: String(payload.message_id || payload.id || ''),
            thread_id: String(payload.thread_id || ''),
            url: String(payload.url || ''),
            metadata: JSON.stringify(payload.metadata || payload),
            received_at: String(payload.received_at || payload.date || integrationNow()),
            is_read: false,
            created_at: integrationNow(),
            updated_at: integrationNow(),
        };

        await upsertRow('business_notifications', record, 'id');
        void emitIntegrationEvent(N8N_WEBHOOK_OWNER_ID, 'business.email.received', { notification: record, raw: payload, source: 'n8n' });

        res.json({
            success: true,
            id: record.id,
            label: record.label,
        });
    } catch (err) {
        console.error('N8N business email webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
    });
}

module.exports = app;
