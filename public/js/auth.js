const ALLOWED_EMAIL = 'flujoxai@gmail.com';
const SESSION_KEY = 'gestor_auth_session';

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authMessage = document.getElementById('auth-message');

function setMessage(text, type = 'info') {
    if (!authMessage) return;
    authMessage.textContent = text || '';
    authMessage.dataset.type = type;
}

function setLocked(locked) {
    document.body.dataset.auth = locked ? 'locked' : 'unlocked';
    if (authScreen) authScreen.style.display = locked ? 'flex' : 'none';
    if (appShell) appShell.style.display = locked ? 'none' : 'flex';
    if (logoutBtn) logoutBtn.style.display = locked ? 'none' : 'inline-flex';
    if (loginForm) loginForm.style.display = locked ? 'grid' : 'none';
}

function saveSession(session) {
    if (session?.access_token) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        window.__GESTOR_ACCESS_TOKEN = session.access_token;
        window.__GESTOR_USER = session.user || null;
    } else {
        localStorage.removeItem(SESSION_KEY);
        window.__GESTOR_ACCESS_TOKEN = '';
        window.__GESTOR_USER = null;
    }
}

async function validateSession(session) {
    if (!session?.access_token) return false;

    const res = await fetch('/api/auth/me', {
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });

    if (!res.ok) return false;

    const data = await res.json();
    const email = String(data?.user?.email || '').toLowerCase();

    if (email !== ALLOWED_EMAIL) return false;

    return true;
}

async function applySession(session) {
    if (!session?.access_token) {
        saveSession(null);
        setLocked(true);
        return;
    }

    const valid = await validateSession(session);
    if (!valid) {
        saveSession(null);
        setMessage('Acceso denegado o sesión inválida.', 'error');
        setLocked(true);
        return;
    }

    saveSession(session);
    setLocked(false);
    setMessage('');

    if (typeof window.startGestorApp === 'function') {
        await window.startGestorApp();
    }
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = String(document.getElementById('login-email').value || '').trim().toLowerCase();
    const password = String(document.getElementById('login-password').value || '');

    if (email !== ALLOWED_EMAIL) {
        setMessage('Acceso denegado. Solo puede entrar flujoxai@gmail.com.', 'error');
        return;
    }

    loginBtn.disabled = true;
    setMessage('Validando credenciales...', 'info');

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            setMessage(data.error || 'No se pudo iniciar sesión.', 'error');
            return;
        }

        await applySession(data);
    } catch (error) {
        setMessage(error?.message || 'No se pudo iniciar sesión.', 'error');
    } finally {
        loginBtn.disabled = false;
    }
});

logoutBtn?.addEventListener('click', async () => {
    saveSession(null);
    setLocked(true);
    window.location.reload();
});

(async () => {
    try {
        const rawSession = localStorage.getItem(SESSION_KEY);
        const session = rawSession ? JSON.parse(rawSession) : null;
        await applySession(session);
    } catch {
        saveSession(null);
        setLocked(true);
    }

    window.__GESTOR_AUTH_READY = true;
})();
