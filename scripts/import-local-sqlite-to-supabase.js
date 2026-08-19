const fs = require('fs');
const path = require('path');
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const {
    upsertRow,
} = require('../database');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

function openSqlite(filePath) {
    return new sqlite3.Database(filePath);
}

function all(db, sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function get(db, sql) {
    return new Promise((resolve, reject) => {
        db.get(sql, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function main() {
    if (!fs.existsSync(dbPath)) {
        throw new Error(`No se encontró la base local: ${dbPath}`);
    }

    const db = openSqlite(dbPath);

    try {
        const projects = await all(db, 'SELECT * FROM projects ORDER BY pipeline_order ASC');
        const tasks = await all(db, 'SELECT * FROM tasks');
        const finances = await all(db, 'SELECT * FROM finances');
        const activities = await all(db, 'SELECT * FROM activities');
        const notes = await all(db, 'SELECT * FROM notes');
        const folders = await all(db, 'SELECT * FROM note_folders');
        const settings = await all(db, 'SELECT * FROM settings');

        console.log(`Projects: ${projects.length}`);
        console.log(`Tasks: ${tasks.length}`);
        console.log(`Finances: ${finances.length}`);
        console.log(`Activities: ${activities.length}`);
        console.log(`Notes: ${notes.length}`);
        console.log(`Folders: ${folders.length}`);
        console.log(`Settings: ${settings.length}`);

        for (const folder of folders) {
            await upsertRow('note_folders', { name: folder.name }, 'name');
        }

        for (const project of projects) {
            await upsertRow('projects', project, 'id');
        }

        for (const task of tasks) {
            await upsertRow('tasks', task, 'id');
        }

        for (const finance of finances) {
            await upsertRow('finances', finance, 'id');
        }

        for (const activity of activities) {
            await upsertRow('activities', activity, 'id');
        }

        for (const note of notes) {
            await upsertRow('notes', note, 'id');
        }

        for (const setting of settings) {
            await upsertRow('settings', setting, 'key');
        }

        console.log('Migración local SQLite -> Supabase completada.');
    } finally {
        db.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
