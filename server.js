const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Promise wrapper for db.all
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}
// Helper: Promise wrapper for db.get
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
}
// Helper: Promise wrapper for db.run
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err); else resolve(this);
        });
    });
}

// ====================================================
// MAIN STATE ENDPOINT (GET all data at once)
// ====================================================
app.get('/api/state', async (req, res) => {
    try {
        const projects = await dbAll('SELECT * FROM projects ORDER BY pipeline_order ASC');
        const tasks    = await dbAll('SELECT * FROM tasks');
        const finances = await dbAll('SELECT * FROM finances');
        const activities = await dbAll('SELECT * FROM activities ORDER BY date DESC LIMIT 50');
        const notes    = await dbAll('SELECT * FROM notes ORDER BY created_at DESC');
        const folders  = await dbAll('SELECT name FROM note_folders');
        const timeSetting = await dbGet("SELECT value FROM settings WHERE key = 'globalTimeSpent'");

        // Embed tasks inside each project
        const projectsWithTasks = projects.map(p => ({
            ...p,
            tasks: tasks.filter(t => t.project_id === p.id).map(t => ({
                ...t,
                dueDate: t.due_date // alias for frontend compatibility
            }))
        }));

        res.json({
            projects: projectsWithTasks,
            currentProjectId: projectsWithTasks.length > 0 ? projectsWithTasks[0].id : null,
            finances,
            activities,
            notes,
            noteFolders: folders.map(f => f.name),
            globalTimeSpent: timeSetting ? parseInt(timeSetting.value) || 0 : 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ====================================================
// PROJECTS
// ====================================================
app.get('/api/projects', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM projects ORDER BY pipeline_order ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects', async (req, res) => {
    const { id, name, status, start_date, end_date, warranty_start, warranty_end } = req.body;
    try {
        const count = await dbGet('SELECT COUNT(*) as c FROM projects');
        await dbRun(
            `INSERT INTO projects (id, name, status, start_date, end_date, warranty_start, warranty_end, pipeline_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, status || 'lead', start_date || '', end_date || '', warranty_start || '', warranty_end || '', count.c]
        );
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/projects/:id', async (req, res) => {
    const { name, status, start_date, end_date, warranty_start, warranty_end } = req.body;
    try {
        await dbRun(
            `UPDATE projects SET name=?, status=?, start_date=?, end_date=?, warranty_start=?, warranty_end=? WHERE id=?`,
            [name, status, start_date, end_date, warranty_start, warranty_end, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM tasks WHERE project_id=?', [req.params.id]);
        await dbRun('DELETE FROM projects WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================================================
// TASKS
// ====================================================
app.get('/api/tasks', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM tasks');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks', async (req, res) => {
    const { id, project_id, title, description, status, priority, due_date } = req.body;
    try {
        await dbRun(
            `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, project_id, title, description || '', status || 'todo', priority || 'Media', due_date || '']
        );
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tasks/:id', async (req, res) => {
    const { title, description, status, priority, due_date } = req.body;
    try {
        await dbRun(
            `UPDATE tasks SET title=?, description=?, status=?, priority=?, due_date=? WHERE id=?`,
            [title, description, status, priority, due_date, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM tasks WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================================================
// FINANCES
// ====================================================
app.get('/api/finances', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM finances ORDER BY date DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finances', async (req, res) => {
    const { id, concept, type, amount, date, project_id } = req.body;
    try {
        await dbRun(
            `INSERT INTO finances (id, concept, type, amount, date, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, concept, type, amount, date, project_id || null]
        );
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/finances/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM finances WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================================================
// ACTIVITIES (Feed)
// ====================================================
app.get('/api/activities', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM activities ORDER BY date DESC LIMIT 50');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/activities', async (req, res) => {
    const { id, title, desc, date } = req.body;
    try {
        await dbRun(
            `INSERT INTO activities (id, title, desc, date) VALUES (?, ?, ?, ?)`,
            [id, title, desc || '', date]
        );
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================================================
// NOTES
// ====================================================
app.get('/api/notes', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM notes ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notes', async (req, res) => {
    const { id, title, content, folder, color, created_at } = req.body;
    try {
        await dbRun(
            `INSERT INTO notes (id, title, content, folder, color, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, title, content || '', folder || 'General', color || '#ffffff', created_at]
        );
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notes/:id', async (req, res) => {
    const { title, content, folder, color } = req.body;
    try {
        await dbRun(
            `UPDATE notes SET title=?, content=?, folder=?, color=? WHERE id=?`,
            [title, content, folder, color, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM notes WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================================================
// NOTE FOLDERS
// ====================================================
app.get('/api/folders', async (req, res) => {
    try {
        const rows = await dbAll('SELECT name FROM note_folders');
        res.json(rows.map(r => r.name));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/folders', async (req, res) => {
    const { name } = req.body;
    try {
        await dbRun('INSERT OR IGNORE INTO note_folders (name) VALUES (?)', [name]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================================================
// SETTINGS
// ====================================================
app.get('/api/settings/:key', async (req, res) => {
    try {
        const row = await dbGet('SELECT value FROM settings WHERE key=?', [req.params.key]);
        res.json({ value: row ? row.value : null });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    try {
        await dbRun(
            `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            [key, String(value)]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Catch-all: serve index.html for SPA
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
