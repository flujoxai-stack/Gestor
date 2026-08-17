const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Projects Table
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'lead',
            start_date TEXT,
            end_date TEXT,
            warranty_start TEXT,
            warranty_end TEXT,
            pipeline_order INTEGER DEFAULT 0
        )`);

        // Tasks Table
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'todo',
            priority TEXT DEFAULT 'Media',
            due_date TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`);

        // Finances Table
        db.run(`CREATE TABLE IF NOT EXISTS finances (
            id TEXT PRIMARY KEY,
            concept TEXT NOT NULL,
            type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            project_id TEXT
        )`);

        // Activities Table (log/feed)
        db.run(`CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            desc TEXT,
            date TEXT NOT NULL
        )`);

        // Notes Table
        db.run(`CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT,
            folder TEXT DEFAULT 'General',
            color TEXT DEFAULT '#ffffff',
            created_at TEXT NOT NULL
        )`);

        // Note Folders Table
        db.run(`CREATE TABLE IF NOT EXISTS note_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`, () => {
            // Insert default folders
            db.run(`INSERT OR IGNORE INTO note_folders (name) VALUES ('General')`);
            db.run(`INSERT OR IGNORE INTO note_folders (name) VALUES ('APIs')`);
            db.run(`INSERT OR IGNORE INTO note_folders (name) VALUES ('Contraseñas')`);
        });

        // Settings Table (for globalTimeSpent, etc.)
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        console.log('Database tables initialized.');
    });
}

module.exports = db;
