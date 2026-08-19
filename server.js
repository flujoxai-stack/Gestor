const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const {
    selectRows,
    selectOneRow,
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
if (AUTH_ALLOWED_EMAILS.length === 0) {
    AUTH_ALLOWED_EMAILS.push(AUTH_FALLBACK_EMAIL);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function requireAuth(req, res, next) {
    if (req.method === 'OPTIONS') return next();

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

app.get('/api/state', async (req, res) => {
    try {
        const projects = await getProjectsWithTasks();
        const finances = await selectRows('finances', { order: 'date.desc' });
        const activities = await selectRows('activities', { order: 'date.desc', limit: 50 });
        const notes = await selectRows('notes', { order: 'created_at.desc' });
        const folders = await selectRows('note_folders', { columns: 'name' });
        const timeSetting = await selectOneRow('settings', { filters: { key: 'globalTimeSpent' } });

        res.json({
            projects,
            currentProjectId: projects.length > 0 ? projects[0].id : null,
            finances,
            activities,
            notes,
            noteFolders: folders.map((f) => f.name),
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
        await upsertRow(
            'projects',
            {
                id,
                name,
                status: status || 'lead',
                start_date: start_date || '',
                end_date: end_date || '',
                warranty_start: warranty_start || '',
                warranty_end: warranty_end || '',
                pipeline_order: existing.length,
            },
            'id'
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { name, status, start_date, end_date, warranty_start, warranty_end } = req.body;
    try {
        await updateRows(
            'projects',
            { id: req.params.id },
            { name, status, start_date, end_date, warranty_start, warranty_end }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        await deleteRows('tasks', { project_id: req.params.id });
        await deleteRows('projects', { id: req.params.id });
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
        await upsertRow(
            'tasks',
            {
                id,
                project_id,
                title,
                description: description || '',
                status: status || 'todo',
                priority: priority || 'Media',
                due_date: due_date || '',
            },
            'id'
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    const { title, description, status, priority, due_date } = req.body;
    try {
        await updateRows(
            'tasks',
            { id: req.params.id },
            { title, description, status, priority, due_date }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await deleteRows('tasks', { id: req.params.id });
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
        await upsertRow(
            'finances',
            {
                id,
                concept,
                type,
                amount,
                date,
                project_id: project_id || null,
            },
            'id'
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/finances/:id', async (req, res) => {
    try {
        await deleteRows('finances', { id: req.params.id });
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
        await upsertRow(
            'notes',
            {
                id,
                title,
                content: content || '',
                folder: folder || 'General',
                color: color || '#ffffff',
                created_at,
            },
            'id'
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notes/:id', async (req, res) => {
    const { title, content, folder, color } = req.body;
    try {
        await updateRows(
            'notes',
            { id: req.params.id },
            { title, content, folder, color }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await deleteRows('notes', { id: req.params.id });
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
    const { name } = req.body;
    try {
        await upsertRow(
            'note_folders',
            {
                name,
            },
            'name'
        );
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

app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
