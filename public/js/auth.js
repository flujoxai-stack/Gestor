import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const SUPABASE_URL = 'https://gtphocpoywrjdkfoxspi.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cGhvY3BveXdyamRrZm94c3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTYxMTgsImV4cCI6MjA4NTEzMjExOH0.GGJ18RVeMWmCE2QNa_LkThdb1rtroIUssR0B3Z8zCBI';
const ALLOWED_EMAIL = 'flujoxai@gmail.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

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

async function applySession(session) {
    if (session?.access_token) {
        const email = String(session?.user?.email || '').toLowerCase();
        if (email !== ALLOWED_EMAIL) {
            await supabase.auth.signOut();
            setMessage('Acceso denegado. Solo puede entrar flujoxai@gmail.com.', 'error');
            setLocked(true);
            return;
        }

        window.__GESTOR_ACCESS_TOKEN = session.access_token;
        window.__GESTOR_USER = session.user || null;
        setLocked(false);
        setMessage('');
        if (typeof window.startGestorApp === 'function') {
            await window.startGestorApp();
        }
    } else {
        window.__GESTOR_ACCESS_TOKEN = '';
        window.__GESTOR_USER = null;
        setLocked(true);
    }
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (email !== ALLOWED_EMAIL) {
        setMessage('Acceso denegado. Solo puede entrar flujoxai@gmail.com.', 'error');
        return;
    }

    loginBtn.disabled = true;
    setMessage('Validando credenciales...', 'info');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    loginBtn.disabled = false;

    if (error) {
        setMessage(error.message || 'No se pudo iniciar sesión.', 'error');
        return;
    }

    await applySession(data.session || null);
});

logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    await supabase.auth.signOut();
    logoutBtn.disabled = false;
    window.location.reload();
});

supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
        await applySession(null);
        return;
    }

    if (session) {
        await applySession(session);
    }
});

(async () => {
    const { data } = await supabase.auth.getSession();
    await applySession(data.session || null);
    window.__GESTOR_AUTH_READY = true;
})();

window.__GESTOR_AUTH_CLIENT = supabase;
