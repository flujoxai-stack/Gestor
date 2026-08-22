const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const {
    selectRows,
    selectOneRow,
    insertRow,
    upsertRow,
    updateRows,
    deleteRows,
} = require('./database');

const app = express();
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
if (AUTH_ALLOWED_EMAILS.length === 0) {
    AUTH_ALLOWED_EMAILS.push(AUTH_FALLBACK_EMAIL);
}
const INTEGRATION_DEFAULT_EVENTS = ['project.created', 'project.updated', 'project.deleted', 'task.created', 'task.updated', 'task.deleted', 'finance.created', 'finance.deleted', 'note.created', 'note.updated', 'note.deleted', 'folder.created', 'business.email.received'];

app.use(cors());
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

        req.user = user;
        return next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

app.use('/api', requireAuth);

app.post('/api/auth/login', async (req, res) => {
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
            return res.status(loginRes.status).json({
                error: payload?.msg || payload?.message || 'No se pudo iniciar sesión',
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

async function getProjectsWithTasks() {
    const projects = await selectRows('projects', { order: 'pipeline_order.asc' });
    const tasks = await selectRows('tasks');
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

async function getIntegrations() {
    const rows = await selectRows('integrations', { order: 'updated_at.desc' });
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

async function getBusinessNotifications(limit = 50) {
    const rows = await selectRows('business_notifications', { order: 'received_at.desc', limit });
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

async function emitIntegrationEvent(eventType, payload, meta = {}) {
    let integrations = [];
    try {
        integrations = await getIntegrations();
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

app.get('/api/state', async (req, res) => {
    try {
        const projects = await getProjectsWithTasks();
        const finances = await selectRows('finances', { order: 'date.desc' });
        const activities = await selectRows('activities', { order: 'date.desc', limit: 50 });
        const notes = await selectRows('notes', { order: 'created_at.desc' });
        const folders = await selectRows('note_folders', { columns: 'name' });
        const timeSetting = await selectOneRow('settings', { filters: { key: 'globalTimeSpent' } });
        const folderColorsSetting = await selectOneRow('settings', { filters: { key: 'noteFolderColors' } });
        const businessNotifications = await getBusinessNotifications(50);
        let integrations = [];
        let integrationEvents = [];
        try {
            integrations = await getIntegrations();
            integrationEvents = await selectRows('integration_events', { order: 'created_at.desc', limit: 20 });
        } catch (integrationError) {
            console.warn('Integrations tables not available yet:', integrationError.message);
        }
        let noteFolderColors = {};
        if (folderColorsSetting && folderColorsSetting.value) {
            try {
                noteFolderColors = JSON.parse(folderColorsSetting.value) || {};
            } catch {
                noteFolderColors = {};
            }
        }

        res.json({
            projects,
            currentProjectId: projects.length > 0 ? projects[0].id : null,
            finances,
            activities,
            notes,
            noteFolders: folders.map((f) => f.name),
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
        const rows = await selectRows('projects', { order: 'pipeline_order.asc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    const { id, name, status, start_date, end_date, warranty_start, warranty_end } = req.body;
    try {
        const existing = await selectRows('projects', { columns: 'id' });
        const projectRecord = {
            id,
            name,
            status: status || 'lead',
            start_date: start_date || '',
            end_date: end_date || '',
            warranty_start: warranty_start || '',
            warranty_end: warranty_end || '',
            pipeline_order: existing.length,
        };
        await upsertRow(
            'projects',
            projectRecord,
            'id'
        );
        void emitIntegrationEvent('project.created', { project: projectRecord, source: 'projects' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { name, status, start_date, end_date, warranty_start, warranty_end } = req.body;
    try {
        const projectRecord = {
            id: req.params.id,
            name,
            status,
            start_date,
            end_date,
            warranty_start,
            warranty_end,
        };
        await updateRows(
            'projects',
            { id: req.params.id },
            { name, status, start_date, end_date, warranty_start, warranty_end }
        );
        void emitIntegrationEvent('project.updated', { project: projectRecord, source: 'projects' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        await deleteRows('tasks', { project_id: req.params.id });
        await deleteRows('projects', { id: req.params.id });
        void emitIntegrationEvent('project.deleted', { project: { id: req.params.id }, source: 'projects' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        const rows = await selectRows('tasks');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    const { id, project_id, title, description, status, priority, due_date } = req.body;
    try {
        const taskRecord = {
            id,
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
        void emitIntegrationEvent('task.created', { task: taskRecord, source: 'tasks' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', async (req, res) => {
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
            { id: req.params.id },
            { title, description, status, priority, due_date }
        );
        void emitIntegrationEvent('task.updated', { task: taskRecord, source: 'tasks' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await deleteRows('tasks', { id: req.params.id });
        void emitIntegrationEvent('task.deleted', { task: { id: req.params.id }, source: 'tasks' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/finances', async (req, res) => {
    try {
        const rows = await selectRows('finances', { order: 'date.desc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/finances', async (req, res) => {
    const { id, concept, type, amount, date, project_id } = req.body;
    try {
        const financeRecord = {
            id,
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
        void emitIntegrationEvent('finance.created', { finance: financeRecord, source: 'finances' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/finances/:id', async (req, res) => {
    try {
        await deleteRows('finances', { id: req.params.id });
        void emitIntegrationEvent('finance.deleted', { finance: { id: req.params.id }, source: 'finances' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/activities', async (req, res) => {
    try {
        const rows = await selectRows('activities', { order: 'date.desc', limit: 50 });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/activities', async (req, res) => {
    const { id, title, desc, date } = req.body;
    try {
        await upsertRow(
            'activities',
            {
                id,
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
        const rows = await selectRows('notes', { order: 'created_at.desc' });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notes', async (req, res) => {
    const { id, title, content, folder, color, created_at } = req.body;
    try {
        const noteRecord = {
            id,
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
        void emitIntegrationEvent('note.created', { note: noteRecord, source: 'notes' });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notes/:id', async (req, res) => {
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
            { id: req.params.id },
            { title, content, folder, color }
        );
        void emitIntegrationEvent('note.updated', { note: noteRecord, source: 'notes' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await deleteRows('notes', { id: req.params.id });
        void emitIntegrationEvent('note.deleted', { note: { id: req.params.id }, source: 'notes' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/folders', async (req, res) => {
    try {
        const rows = await selectRows('note_folders', { columns: 'name' });
        res.json(rows.map((r) => r.name));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/folders', async (req, res) => {
    const { name, color } = req.body;
    try {
        await upsertRow(
            'note_folders',
            {
                name,
            },
            'name'
        );
        if (name && color) {
            const current = await selectOneRow('settings', { filters: { key: 'noteFolderColors' } });
            let colors = {};
            if (current && current.value) {
                try {
                    colors = JSON.parse(current.value) || {};
                } catch {
                    colors = {};
                }
            }
            colors[name] = color;
            await upsertRow('settings', { key: 'noteFolderColors', value: JSON.stringify(colors) }, 'key');
        }
        void emitIntegrationEvent('folder.created', { folder: { name, color: color || null }, source: 'folders' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/:key', async (req, res) => {
    try {
        const row = await selectOneRow('settings', { filters: { key: req.params.key } });
        res.json({ value: row ? row.value : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    try {
        await upsertRow(
            'settings',
            {
                key,
                value: String(value),
            },
            'key'
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/integrations', async (req, res) => {
    try {
        const rows = await getIntegrations();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/integration-events', async (req, res) => {
    try {
        const rows = await selectRows('integration_events', { order: 'created_at.desc', limit: 50 });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/integrations', async (req, res) => {
    const {
        id,
        name,
        type = 'webhook',
        endpoint = '',
        secret = '',
        enabled = true,
        events = ['all'],
        headers = {},
        method = 'POST',
    } = req.body || {};
    try {
        const now = integrationNow();
        const record = {
            id: id || `${Date.now()}`,
            name,
            type,
            enabled: enabled === true || enabled === 'true' || enabled === 1 || enabled === '1',
            config: JSON.stringify({
                endpoint,
                secret,
                method,
                events: Array.isArray(events) ? events : String(events || '')
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                headers,
            }),
            created_at: now,
            updated_at: now,
        };
        await upsertRow('integrations', record, 'id');
        res.json({ success: true, id: record.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/integrations/:id', async (req, res) => {
    const {
        name,
        type = 'webhook',
        endpoint = '',
        secret = '',
        enabled = true,
        events = ['all'],
        headers = {},
        method = 'POST',
    } = req.body || {};
    try {
        await updateRows(
            'integrations',
            { id: req.params.id },
            {
                name,
                type,
                enabled: enabled === true || enabled === 'true' || enabled === 1 || enabled === '1',
                config: JSON.stringify({
                    endpoint,
                    secret,
                    method,
                    events: Array.isArray(events) ? events : String(events || '')
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    headers,
                }),
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
        await deleteRows('integrations', { id: req.params.id });
        await deleteRows('integration_events', { integration_id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/integrations/:id/test', async (req, res) => {
    try {
        const integration = await selectOneRow('integrations', { filters: { id: req.params.id } });
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
                const response = await fetch(normalized.endpoint, {
                    method: normalized.method || 'POST',
                    headers,
                    body: payload,
                });
                const text = await response.text();
                await logIntegrationEvent({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        const rows = await getBusinessNotifications(100);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/business-notifications/:id', async (req, res) => {
    const { is_read, label, notes } = req.body || {};
    try {
        await updateRows(
            'business_notifications',
            { id: req.params.id },
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
        if (N8N_WEBHOOK_SECRET) {
            const secretHeader = String(req.headers['x-gestor-webhook-secret'] || '').trim();
            if (!secretHeader || secretHeader !== N8N_WEBHOOK_SECRET) {
                return res.status(401).json({ error: 'Invalid webhook secret' });
            }
        }

        const payload = req.body || {};
        const record = {
            id: String(payload.id || payload.message_id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
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
        void emitIntegrationEvent('business.email.received', { notification: record, raw: payload, source: 'n8n' });

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

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
