const API_URL = 'http://localhost:3000/api';

const api = {
    async getProjects() {
        const response = await fetch(`${API_URL}/projects`);
        return response.json();
    },
    async createProject(data) {
        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    async getTasks() {
        const response = await fetch(`${API_URL}/tasks`);
        return response.json();
    },
    async createTask(data) {
        const response = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    async getFinances() {
        const response = await fetch(`${API_URL}/finances`);
        return response.json();
    },
    async createFinance(data) {
        const response = await fetch(`${API_URL}/finances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    async getActivities() {
        const response = await fetch(`${API_URL}/activities`);
        return response.json();
    },
    async createActivity(data) {
        const response = await fetch(`${API_URL}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    async getNotes() {
        const response = await fetch(`${API_URL}/notes`);
        return response.json();
    },
    async createNote(data) {
        const response = await fetch(`${API_URL}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    }
};

window.api = api;
