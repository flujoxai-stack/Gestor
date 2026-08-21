/**
 * api.js — Capa de servicio: conecta el frontend con el backend Express/SQLite
 */

const API_URL = '/api';
const nativeFetch = window.fetch.bind(window);

async function apiFetch(input, options = {}) {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const headers = new Headers(options.headers || (input && input.headers ? input.headers : undefined));
    if (requestUrl.startsWith(API_URL) && window.__GESTOR_ACCESS_TOKEN) {
        headers.set('Authorization', `Bearer ${window.__GESTOR_ACCESS_TOKEN}`);
    }
    return nativeFetch(input, { ...options, headers });
}

// Genera un ID único tipo timestamp (compatible con el sistema original)
function genId() {
    return Date.now() + Math.random().toString(36).substr(2, 5);
}

const api = {
    // ---- STATE (carga completa de una vez) ----
    async getState() {
        const res = await apiFetch(`${API_URL}/state`);
        if (!res.ok) throw new Error('Error cargando estado');
        return res.json();
    },

    // ---- PROJECTS ----
    async createProject(data) {
        const id = genId();
        const res = await apiFetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, id: String(id) })
        });
        if (!res.ok) throw new Error('Error creando proyecto');
        return { ...data, id: String(id), tasks: [] };
    },
    async updateProject(id, data) {
        const res = await apiFetch(`${API_URL}/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Error actualizando proyecto');
        return res.json();
    },
    async deleteProject(id) {
        const res = await apiFetch(`${API_URL}/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando proyecto');
        return res.json();
    },

    // ---- TASKS ----
    async createTask(projectId, taskData) {
        const id = genId();
        const res = await apiFetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: String(id),
                project_id: String(projectId),
                title: taskData.title,
                description: taskData.description || '',
                status: taskData.status || 'todo',
                priority: taskData.priority || 'Media',
                due_date: taskData.dueDate || taskData.due_date || ''
            })
        });
        if (!res.ok) throw new Error('Error creando tarea');
        return { ...taskData, id: String(id), dueDate: taskData.dueDate || '' };
    },
    async updateTask(id, taskData) {
        const res = await apiFetch(`${API_URL}/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: taskData.title,
                description: taskData.description || '',
                status: taskData.status || 'todo',
                priority: taskData.priority || 'Media',
                due_date: taskData.dueDate || taskData.due_date || ''
            })
        });
        if (!res.ok) throw new Error('Error actualizando tarea');
        return res.json();
    },
    async deleteTask(id) {
        const res = await apiFetch(`${API_URL}/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando tarea');
        return res.json();
    },

    // ---- FINANCES ----
    async createFinance(data) {
        const id = genId();
        const res = await apiFetch(`${API_URL}/finances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, id: String(id) })
        });
        if (!res.ok) throw new Error('Error creando movimiento');
        return { ...data, id: String(id) };
    },
    async deleteFinance(id) {
        const res = await apiFetch(`${API_URL}/finances/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando movimiento');
        return res.json();
    },

    // ---- ACTIVITIES ----
    async logActivity(title, desc) {
        const id = genId();
        const date = new Date().toISOString();
        const res = await apiFetch(`${API_URL}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: String(id), title, desc: desc || '', date })
        });
        if (!res.ok) throw new Error('Error registrando actividad');
        return { id: String(id), title, desc: desc || '', date };
    },

    // ---- NOTES ----
    async createNote(data) {
        const id = genId();
        const created_at = new Date().toISOString();
        const res = await apiFetch(`${API_URL}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, id: String(id), created_at })
        });
        if (!res.ok) throw new Error('Error creando nota');
        return { ...data, id: String(id), created_at };
    },
    async updateNote(id, data) {
        const res = await apiFetch(`${API_URL}/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Error actualizando nota');
        return res.json();
    },
    async deleteNote(id) {
        const res = await apiFetch(`${API_URL}/notes/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando nota');
        return res.json();
    },

    // ---- FOLDERS ----
    async createFolder(name, color) {
        const res = await apiFetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        if (!res.ok) throw new Error('Error creando carpeta');
        return res.json();
    },

    // ---- INTEGRATIONS ----
    async getIntegrations() {
        const res = await apiFetch(`${API_URL}/integrations`);
        if (!res.ok) throw new Error('Error cargando integraciones');
        return res.json();
    },
    async createIntegration(data) {
        const id = genId();
        const res = await apiFetch(`${API_URL}/integrations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, id: String(id) })
        });
        if (!res.ok) throw new Error('Error creando integración');
        return { ...data, id: String(id) };
    },
    async updateIntegration(id, data) {
        const res = await apiFetch(`${API_URL}/integrations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Error actualizando integración');
        return res.json();
    },
    async deleteIntegration(id) {
        const res = await apiFetch(`${API_URL}/integrations/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error eliminando integración');
        return res.json();
    },
    async testIntegration(id) {
        const res = await apiFetch(`${API_URL}/integrations/${id}/test`, { method: 'POST' });
        if (!res.ok) throw new Error('Error probando integración');
        return res.json();
    },
    async getIntegrationEvents() {
        const res = await apiFetch(`${API_URL}/integration-events`);
        if (!res.ok) throw new Error('Error cargando eventos de integración');
        return res.json();
    },

    // ---- SETTINGS ----
    async saveSetting(key, value) {
        const res = await apiFetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        if (!res.ok) throw new Error('Error guardando ajuste');
        return res.json();
    }
};

window.api = api;
