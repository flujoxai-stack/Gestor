const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

// Projects
app.get('/api/projects', (req, res) => {
    db.all("SELECT * FROM projects", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/projects', (req, res) => {
    const { name, description, status, start_date, end_date } = req.body;
    db.run(
        "INSERT INTO projects (name, description, status, start_date, end_date) VALUES (?, ?, ?, ?, ?)",
        [name, description, status, start_date, end_date],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// Tasks
app.get('/api/tasks', (req, res) => {
    db.all("SELECT * FROM tasks", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks', (req, res) => {
    const { project_id, title, description, status, priority, due_date } = req.body;
    db.run(
        "INSERT INTO tasks (project_id, title, description, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?)",
        [project_id, title, description, status, priority, due_date],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// Finances
app.get('/api/finances', (req, res) => {
    db.all("SELECT * FROM finances", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/finances', (req, res) => {
    const { concept, type, amount, date } = req.body;
    db.run(
        "INSERT INTO finances (concept, type, amount, date) VALUES (?, ?, ?, ?)",
        [concept, type, amount, date],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// Activities
app.get('/api/activities', (req, res) => {
    db.all("SELECT * FROM activities ORDER BY date DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/activities', (req, res) => {
    const { action, date, user_id, project_id } = req.body;
    db.run(
        "INSERT INTO activities (action, date, user_id, project_id) VALUES (?, ?, ?, ?)",
        [action, date, user_id, project_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// Notes
app.get('/api/notes', (req, res) => {
    db.all("SELECT * FROM notes", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/notes', (req, res) => {
    const { content, created_at } = req.body;
    db.run(
        "INSERT INTO notes (content, created_at) VALUES (?, ?)",
        [content, created_at],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
