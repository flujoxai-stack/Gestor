const SESSION_KEY = 'gestor_auth_session';

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginLogoutBtn = document.getElementById('logout-btn');
const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
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
    if (loginLogoutBtn) loginLogoutBtn.style.display = 'none';
    if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = locked ? 'none' : 'flex';
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

// El correo permitido lo decide el servidor (variable de entorno
// AUTH_ALLOWED_EMAILS), no este archivo -- así el repo público nunca
// expone en el código quiénes tienen acceso. /api/auth/me ya responde
// 403 si el correo de la sesión no está en esa lista.
async function validateSession(session) {
    if (!session?.access_token) return false;

    const res = await fetch('/api/auth/me', {
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });

    return res.ok;
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

    // DIS-03: mostrar el correo real de la sesión en vez de un perfil
    // fijo ("Admin Store / Pro User") que no era la persona que usa la app.
    // El sidebar y el header solo necesitan un nombre corto, no el correo
    // completo -- se deriva de la parte antes de "@" (ej. "flujoxai" de
    // "flujoxai@gmail.com"). El correo completo sigue visible tal cual en
    // el modal de Perfil (#profile-email), donde sí es información útil.
    const email = session.user?.email || '';
    const displayName = email.split('@')[0].replace(/^./, (c) => c.toUpperCase()) || email;
    document.getElementById('sidebar-user-email')?.replaceChildren(displayName);
    document.getElementById('header-user-email')?.replaceChildren(displayName);

    if (typeof window.startGestorApp === 'function') {
        await window.startGestorApp();
    }
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = String(document.getElementById('login-email').value || '').trim().toLowerCase();
    const password = String(document.getElementById('login-password').value || '');

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

async function logout() {
    saveSession(null);
    setLocked(true);
    window.location.reload();
}

loginLogoutBtn?.addEventListener('click', logout);
sidebarLogoutBtn?.addEventListener('click', logout);

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
