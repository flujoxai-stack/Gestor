/**
 * main.js — Lógica principal del Gestor de Proyectos Invivienda
 * 
 * FASE 2: Integración con backend Node.js + SQLite.
 * El estado sigue siendo local en memoria (objeto `state`), 
 * pero se sincroniza con la base de datos a través de api.js.
 */

// ========================================================
// ESTADO GLOBAL
// ========================================================
let state = {
    projects: [],
    currentProjectId: null,
    finances: [],
    activities: [],
    notes: [],
    noteFolders: ['General', 'APIs', 'Contraseñas'],
    noteFolderColors: {},
    integrations: [],
    integrationEvents: [],
    businessNotifications: [],
    globalTimeSpent: 0
};

// ========================================================
// ÍCONOS
// ========================================================
// Antes: emojis (🗑️ ✏️ 📅 📋) mezclados con el resto de la interfaz, que
// usa íconos de línea (stroke) en todos lados. Se ven distinto en cada
// sistema operativo/fuente y no combinan con nada — estos SVG son los
// mismos trazos que ya usa el sidebar, solo que en tamaño de acción.
const ICON_TRASH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
const ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
const ICON_CALENDAR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICON_ACTIVITY = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>';

// ========================================================
// SINCRONIZACIÓN CON API (reemplaza localStorage)
// ========================================================

/**
 * Carga el estado completo desde el servidor.
 */
async function loadState() {
    try {
        const data = await api.getState();
        state.projects       = data.projects       || [];
        state.finances       = data.finances       || [];
        state.activities     = data.activities     || [];
        state.notes          = data.notes          || [];
        state.noteFolders    = data.noteFolders    || ['General', 'APIs', 'Contraseñas'];
        state.noteFolderColors = data.noteFolderColors || {};
        state.integrations   = data.integrations   || [];
        state.integrationEvents = data.integrationEvents || [];
        state.businessNotifications = data.businessNotifications || [];
        state.globalTimeSpent = data.globalTimeSpent || 0;
        state.currentProjectId = data.currentProjectId || 
            (state.projects.length > 0 ? state.projects[0].id : null);
    } catch (e) {
        console.error('Error cargando estado desde servidor:', e);
        // Fallback a estado vacío
        if (!state.projects)    state.projects = [];
        if (!state.finances)    state.finances = [];
        if (!state.activities)  state.activities = [];
        if (!state.notes)       state.notes = [];
        if (!state.noteFolders) state.noteFolders = ['General','APIs','Contraseñas'];
        if (!state.noteFolderColors) state.noteFolderColors = {};
        if (!state.integrations) state.integrations = [];
        if (!state.integrationEvents) state.integrationEvents = [];
        if (!state.businessNotifications) state.businessNotifications = [];
    }
}

/**
 * "Guarda" el timer (globalTimeSpent) al servidor.
 * El resto de datos se guarda de forma granular (por CRUD).
 */
async function saveTimerState() {
    try {
        await api.saveSetting('globalTimeSpent', state.globalTimeSpent);
    } catch (e) { /* fallo silencioso para el timer */ }
}

// Alias para compatibilidad con código original que llama saveState()
// (en esta versión no hace nada pesado, los datos ya se guardan en cada operación)
function saveState() {
    saveTimerState();
}

// ========================================================
// SEGURIDAD: escape de HTML
// ========================================================
// Todo dato que venga del servidor (nombres de proyecto, títulos de tarea,
// notas, correos de negocio…) es contenido potencialmente hostil: puede
// haber sido escrito por un tercero (p. ej. el asunto de un correo real
// reenviado por n8n). Nunca se inserta crudo en innerHTML.
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));
}

// ========================================================
// ACTIVIDADES (FEED)
// ========================================================
window.logActivity = async function(title, desc) {
    try {
        const activity = await api.logActivity(title, desc);
        state.activities.unshift(activity);
        renderActivityFeed();
    } catch (e) { console.error('Error logActivity:', e); }
};

function renderActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    feed.innerHTML = '';
    state.activities.slice(0, 20).forEach(a => {
        const div = document.createElement('div');
        div.className = 'custom-list-item';
        const dateStr = a.date ? new Date(a.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
        div.innerHTML = `
            <div class="item-left">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--main-bg);display:flex;align-items:center;justify-content:center;color:var(--sidebar-active);flex-shrink:0;">${ICON_ACTIVITY}</div>
                <div style="display:flex;flex-direction:column;justify-content:center;">
                    <div style="font-size:0.85rem;font-weight:600;">${escapeHtml(a.title)}</div>
                    <small style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(a.desc || '')}</small>
                </div>
            </div>
            <div class="item-right" style="font-size:0.75rem;color:var(--text-muted);text-align:right;">${dateStr}</div>`;
        feed.appendChild(div);
    });
    if (state.activities.length === 0) {
        feed.innerHTML = '<p class="text-muted small mt-2">No hay actividad reciente.</p>';
    }
}

// ========================================================
// INICIALIZACIÓN (DOMContentLoaded)
// ========================================================
window.startGestorApp = async function startGestorApp() {
    if (window.__GESTOR_APP_STARTED) return;
    window.__GESTOR_APP_STARTED = true;

    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('main-subtitle').textContent =
        "Resumen de datos para " + new Intl.DateTimeFormat('es-ES', dateOptions).format(new Date());

    // Cargar datos del servidor
    await loadState();

    // Toast notifications
    function showToast(msg) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast-custom';
        toast.innerHTML = `<svg width="20" height="20" fill="none" stroke="#3f7d58" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> <span>${escapeHtml(msg)}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('hide-toast'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // Interceptar logActivity para mostrar Toast también
    const originalLog = window.logActivity;
    window.logActivity = function(title, desc) {
        showToast(title);
        if (originalLog) originalLog(title, desc);
    };

    // ---- VISTAS ----
    const views = {
        dashboard: document.getElementById('dashboard-view'),
        projects:  document.getElementById('projects-view'),
        board:     document.getElementById('board-view'),
        calendar:  document.getElementById('calendar-view'),
        finances:  document.getElementById('finances-view'),
        activity:  document.getElementById('activity-view'),
        pipeline:  document.getElementById('pipeline-view'),
        notes:     document.getElementById('notes-view'),
        businessMail: document.getElementById('business-mail-view'),
        integrations: document.getElementById('integrations-view')
    };
    const navLinks = {
        dashboard: document.getElementById('nav-dashboard'),
        projects:  document.getElementById('nav-projects'),
        board:     document.getElementById('nav-tasks'),
        calendar:  document.getElementById('nav-calendar'),
        finances:  document.getElementById('nav-finances'),
        activity:  document.getElementById('nav-activity'),
        pipeline:  document.getElementById('nav-pipeline'),
        notes:     document.getElementById('nav-notes'),
        businessMail: document.getElementById('nav-business-mail'),
        integrations: document.getElementById('nav-integrations')
    };
    const sidebar = document.getElementById('sidebar-menu');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNavTargets = document.querySelectorAll('.sidebar .nav-link, .sidebar .nav-bottom-btn, .sidebar .dropdown-item');
    const mobileBreakpoint = window.matchMedia('(max-width: 992px)');

    function syncSidebarState(open) {
        if (!sidebar || !sidebarBackdrop || !mobileMenuToggle) return;
        sidebar.classList.toggle('is-open', open);
        sidebarBackdrop.classList.toggle('is-visible', open);
        mobileMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
    }

    function closeSidebar() {
        syncSidebarState(false);
    }

    function toggleSidebar() {
        if (!sidebar) return;
        syncSidebarState(!sidebar.classList.contains('is-open'));
    }

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', (event) => {
            event.preventDefault();
            toggleSidebar();
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeSidebar);
    }

    mobileNavTargets.forEach((target) => {
        target.addEventListener('click', () => {
            if (mobileBreakpoint.matches) closeSidebar();
        });
    });

    window.addEventListener('resize', () => {
        if (!mobileBreakpoint.matches) closeSidebar();
    });

    function showView(viewName, title, subtitle) {
        Object.values(views).forEach(v => { v.style.display = 'none'; v.classList.remove('animate-view'); });
        Object.values(navLinks).forEach(l => l.classList.remove('active'));
        void views[viewName].offsetWidth;
        views[viewName].style.display = 'block';
        views[viewName].classList.add('animate-view');
        navLinks[viewName].classList.add('active');
        document.getElementById('main-title').textContent = title;
        document.getElementById('main-subtitle').textContent = subtitle || '';
        document.getElementById('fab-add-task').style.display = viewName === 'board' ? 'flex' : 'none';
        if (mobileBreakpoint.matches) closeSidebar();
    }

    // ---- CHARTS ----
    let pieChart, areaChart, progressChart;
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";

    // Antes el Dashboard tenía 6 tipos de gráfico distintos (barras, dona,
    // gauge, área, radar, polar) para apenas un puñado de proyectos y
    // tareas — el radar y el polar casi no tenían datos que mostrar y
    // terminaban siendo decoración. Se quitaron los dos, y se agregó una
    // fila de "Negocio en un vistazo" con datos que sí cambian con tu
    // trabajo real: correos sin leer, valor en negociación, balance del mes.
    // El de "Progreso por Proyecto" es un gráfico de barras real (Chart.js,
    // con esquinas redondeadas) en vez de una lista con barritas planas.
    function renderProjectProgressChart() {
        const canvas = document.getElementById('projectProgressChart');
        const emptyMsg = document.getElementById('project-progress-empty');
        if (!canvas) return;
        const rows = state.projects
            .map((p) => {
                const total = p.tasks.length;
                const done = p.tasks.filter((t) => t.status === 'done').length;
                return { name: p.name, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
            })
            .filter((p) => p.total > 0)
            .sort((a, b) => b.total - a.total);

        if (progressChart) { progressChart.destroy(); progressChart = null; }

        if (!rows.length) {
            canvas.style.display = 'none';
            if (emptyMsg) emptyMsg.style.display = 'block';
            updateMiniProgressBadge([], []);
            return;
        }
        canvas.style.display = 'block';
        if (emptyMsg) emptyMsg.style.display = 'none';

        // Mismos colores que ya usa la dona "Estado de Tareas" y los
        // íconos de KPI del propio Dashboard (teal, ámbar, azul acero,
        // rojo). El verde queda reservado solo para el 100% completado
        // (como en la dona), así nunca compite con el ciclo y nunca
        // salen dos barras seguidas del mismo color.
        const PROGRESS_COLORS = ['#1f6f78', '#b98a2e', '#3e6e93', '#b4453d'];
        let colorIndex = 0;
        const colors = rows.map((p) => {
            if (p.pct === 100) return '#3f7d58';
            const c = PROGRESS_COLORS[colorIndex % PROGRESS_COLORS.length];
            colorIndex++;
            return c;
        });

        updateMiniProgressBadge(rows, colors);

        const txtColor = document.body.dataset.theme === 'dark' ? '#9aa1ac' : '#6b7280';
        const gridColor = document.body.dataset.theme === 'dark' ? '#2e333b' : '#e2e5e9';
        const pendingColor = document.body.dataset.theme === 'dark' ? '#3a3f47' : '#e2e5e9';

        // Una barra sola por proyecto se veía muy "seca" con pocos
        // proyectos. Se agrega una segunda barra gris al lado con lo
        // pendiente (100 - % completado), como referencia visual detrás
        // de la barra de color — le da al gráfico el mismo aire que un
        // bar chart real con varias series en vez de un solo dato suelto.
        progressChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: rows.map((p) => p.name),
                datasets: [
                    {
                        label: 'Pendiente',
                        data: rows.map((p) => 100 - p.pct),
                        backgroundColor: pendingColor,
                        borderRadius: 8,
                        borderSkipped: false,
                        maxBarThickness: 34,
                        barPercentage: 1,
                        categoryPercentage: 0.55
                    },
                    {
                        label: 'Completado',
                        data: rows.map((p) => p.pct),
                        backgroundColor: colors,
                        borderRadius: 8,
                        borderSkipped: false,
                        maxBarThickness: 34,
                        barPercentage: 1,
                        categoryPercentage: 0.55
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: txtColor, font: { size: 11 } } },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: gridColor },
                        border: { display: false },
                        ticks: { color: txtColor, stepSize: 25, callback: (v) => v + '%' }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: txtColor, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const p = rows[ctx.dataIndex];
                                return ctx.datasetIndex === 1
                                    ? `${p.pct}% completado (${p.done}/${p.total} tareas)`
                                    : `${100 - p.pct}% pendiente (${p.total - p.done}/${p.total} tareas)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // El ícono junto al título es un resumen real, no decoración: cada
    // barrita es uno de tus primeros 5 proyectos (mismo orden y colores
    // que el gráfico grande) y su alto es su % de avance real. Con menos
    // de 5 proyectos, las barras sobrantes quedan como base mínima gris.
    function updateMiniProgressBadge(rows, colors) {
        const badge = document.getElementById('dash-mini-progress-badge');
        if (!badge) return;
        const bars = badge.querySelectorAll('.mini-chart-bar');
        const mutedColor = document.body.dataset.theme === 'dark' ? '#3a3f47' : '#e2e5e9';
        bars.forEach((bar, i) => {
            const p = rows[i];
            if (p) {
                bar.style.height = Math.max(p.pct, 4) + '%';
                bar.style.background = colors[i];
                bar.title = `${p.name}: ${p.pct}%`;
            } else {
                bar.style.height = '4%';
                bar.style.background = mutedColor;
                bar.removeAttribute('title');
            }
        });
    }

    function renderBusinessGlanceTiles() {
        const unreadEl = document.getElementById('dash-mail-unread');
        if (unreadEl) unreadEl.textContent = String(state.businessNotifications.filter((m) => !m.is_read).length);

        const pipelineValueEl = document.getElementById('dash-pipeline-value');
        if (pipelineValueEl) {
            const value = state.projects
                .filter((p) => p.status === 'lead' || p.status === 'negotiation')
                .reduce((sum, p) => sum + projectPipelineValue(p), 0);
            pipelineValueEl.textContent = formatMoney(value);
        }

        const monthBalanceEl = document.getElementById('dash-month-balance');
        if (monthBalanceEl) {
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            let monthInc = 0, monthExp = 0;
            state.finances.forEach((f) => {
                if (String(f.date || '').startsWith(monthKey)) {
                    if (f.type === 'income') monthInc += parseFloat(f.amount) || 0;
                    else monthExp += parseFloat(f.amount) || 0;
                }
            });
            monthBalanceEl.textContent = `$${(monthInc - monthExp).toFixed(2)}`;
        }
    }

    function renderDashboard() {
        let tTotal=0, tDone=0, tPend=0, tRev=0, tTodo=0;
        let upcoming=[];
        let futureDates=[], futureLabels=[];
        for(let i=0;i<7;i++){
            let d=new Date(); d.setDate(d.getDate()+i);
            futureDates.push(d.toISOString().split('T')[0]);
            futureLabels.push(new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric'}).format(d));
        }
        let futureCounts=futureDates.map(()=>0);

        state.projects.forEach(p=>{
            p.tasks.forEach(t=>{
                tTotal++;
                if(t.status==='done'){tDone++;}
                else{
                    tPend++;
                    if(t.status==='inprogress')tRev++;
                    if(t.status==='todo')tTodo++;
                    if(t.dueDate){
                        let idx=futureDates.indexOf(t.dueDate);
                        if(idx!==-1)futureCounts[idx]++;
                        upcoming.push({title:t.title,date:t.dueDate,pName:p.name});
                    }
                }
            });
        });

        document.getElementById('stat-total').textContent=tTotal;
        document.getElementById('stat-done').textContent=tDone;
        document.getElementById('stat-pending').textContent=tPend;
        document.getElementById('stat-proj').textContent=state.projects.length;
        document.getElementById('list-done').textContent=tDone;
        document.getElementById('list-rev').textContent=tRev;
        document.getElementById('list-todo').textContent=tTodo;
        document.getElementById('pie-center-val').textContent=tTotal;

        upcoming.sort((a,b)=>new Date(a.date)-new Date(b.date));
        const upList=document.getElementById('upcoming-tasks-list');
        upList.innerHTML='';
        upcoming.slice(0,4).forEach(u=>{
            upList.innerHTML+=`<div class="custom-list-item"><div class="item-left"><div style="width:30px;height:30px;border-radius:50%;background:rgba(31, 111, 120,0.12);display:flex;align-items:center;justify-content:center;color:#1f6f78;flex-shrink:0;">${ICON_CALENDAR}</div> <div style="display:flex; flex-direction:column; justify-content:center;"><div style="font-size:0.85rem;line-height:1.2;font-weight:600;">${escapeHtml(u.title)}</div><small style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(u.pName)}</small></div></div><div class="item-right" style="font-size:0.8rem;color:var(--text-muted);text-align:right;">${escapeHtml(u.date)}</div></div>`;
        });
        if(upcoming.length===0){
            upList.innerHTML=`<div style="text-align:center; padding:1.5rem 0.5rem; color:var(--text-muted);"><div style="display:flex; justify-content:center; margin-bottom:0.6rem; opacity:0.6;">${ICON_CALENDAR}</div><p class="small mb-0">No tienes tareas con fecha próxima.</p><p class="small mb-0">Agrégale una fecha de vencimiento a una tarea para verla aquí.</p></div>`;
        }

        const txtColor=document.body.dataset.theme==='dark'?'#edeef0':'#6b7280';
        const gridColor=document.body.dataset.theme==='dark'?'#2e333b':'#e2e5e9';

        renderProjectProgressChart();

        if(pieChart)pieChart.destroy();
        pieChart=new Chart(document.getElementById('pieChart'),{type:'doughnut',data:{labels:['Completadas','En Revisión','Por Hacer'],datasets:[{data:[tDone,tRev,tTodo],backgroundColor:['#1f6f78','#3f7d58','#b4453d'],borderWidth:0,cutout:'75%'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});

        if(areaChart)areaChart.destroy();
        let areaCtx=document.getElementById('areaChart').getContext('2d');
        let gradient=areaCtx.createLinearGradient(0,0,0,250);
        gradient.addColorStop(0,'rgba(31, 111, 120,0.4)');gradient.addColorStop(1,'rgba(31, 111, 120,0.0)');
        areaChart=new Chart(document.getElementById('areaChart'),{type:'line',data:{labels:futureLabels,datasets:[{label:'Tareas a vencer',data:futureCounts,borderColor:'#1f6f78',backgroundColor:gradient,fill:true,tension:0.4,pointBackgroundColor:'#fff',pointBorderColor:'#1f6f78',pointBorderWidth:2,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false},ticks:{color:txtColor}},y:{grid:{color:gridColor},border:{display:false},ticks:{color:txtColor,stepSize:1}}},plugins:{legend:{display:false}}}});

        renderBusinessGlanceTiles();

        let inc=0,exp=0;
        state.finances.forEach(f=>{if(f.type==='income')inc+=parseFloat(f.amount);else exp+=parseFloat(f.amount);});
        document.getElementById('dash-fin-inc').textContent=`$${inc.toFixed(2)}`;
        document.getElementById('dash-fin-exp').textContent=`$${exp.toFixed(2)}`;
        document.getElementById('dash-fin-bal').textContent=`$${(inc-exp).toFixed(2)}`;

        let ppLead=0,ppNeg=0,ppExe=0,ppDone=0;
        state.projects.forEach(p=>{
            if(p.status==='lead')ppLead++;
            else if(p.status==='negotiation')ppNeg++;
            else if(p.status==='execution')ppExe++;
            else if(p.status==='delivered')ppDone++;
        });
        document.getElementById('dash-pipe-lead').textContent=ppLead;
        document.getElementById('dash-pipe-neg').textContent=ppNeg;
        document.getElementById('dash-pipe-exe').textContent=ppExe;
        document.getElementById('dash-pipe-done').textContent=ppDone;

        window.renderTimeTracking();
        window.renderProductivityGauge();
    }

    // ---- TIME TRACKING ----
    window.globalTimerActive = false;
    window.globalTimerInterval = null;

    function formatTime(seconds) {
        const h=Math.floor(seconds/3600).toString().padStart(2,'0');
        const m=Math.floor((seconds%3600)/60).toString().padStart(2,'0');
        const s=Math.floor(seconds%60).toString().padStart(2,'0');
        return `${h}:${m}:${s}`;
    }

    window.toggleGlobalTimer = function() {
        if(window.globalTimerActive){
            clearInterval(window.globalTimerInterval);
            window.globalTimerActive=false;
            document.getElementById('global-timer-btn').innerHTML='<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            document.getElementById('global-timer-btn').style.background='var(--sidebar-active)';
            saveState();
        } else {
            window.globalTimerActive=true;
            document.getElementById('global-timer-btn').innerHTML='<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            document.getElementById('global-timer-btn').style.background='#b4453d';
            if(!state.globalTimeSpent)state.globalTimeSpent=0;
            window.globalTimerInterval=setInterval(()=>{
                state.globalTimeSpent++;
                document.getElementById('global-timer-display').textContent=formatTime(state.globalTimeSpent);
                if(state.globalTimeSpent%10===0)saveState();
            },1000);
        }
    };

    window.renderTimeTracking = function() {
        if(!state.globalTimeSpent)state.globalTimeSpent=0;
        document.getElementById('global-timer-display').textContent=formatTime(state.globalTimeSpent);
        if(window.globalTimerActive){
            document.getElementById('global-timer-btn').innerHTML='<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            document.getElementById('global-timer-btn').style.background='#b4453d';
        } else {
            document.getElementById('global-timer-btn').innerHTML='<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            document.getElementById('global-timer-btn').style.background='var(--sidebar-active)';
        }
    };

    window.renderProductivityGauge = function() {
        let tTotal=0,tDone=0;
        state.projects.forEach(p=>{ p.tasks.forEach(t=>{ tTotal++; if(t.status==='done')tDone++; }); });
        const percentage=tTotal===0?0:Math.round((tDone/tTotal)*100);
        document.getElementById('productivity-val').textContent=percentage+'%';
        const svg=document.getElementById('productivity-gauge');
        svg.innerHTML='';
        const totalSegments=16;
        const activeSegments=Math.round((percentage/100)*totalSegments);
        const inactiveColor=document.body.dataset.theme==='dark'?'#2e333b':'#e2e5e9';
        let lines=[];
        for(let i=0;i<totalSegments;i++){
            const line=document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1','20');line.setAttribute('y1','110');
            line.setAttribute('x2','55');line.setAttribute('y2','110');
            line.setAttribute('transform',`rotate(${i*(180/(totalSegments-1))},110,110)`);
            line.setAttribute('stroke',inactiveColor);
            line.setAttribute('stroke-width','12');
            line.setAttribute('stroke-linecap','round');
            line.style.transition='stroke 0.3s ease';
            svg.appendChild(line);lines.push(line);
        }
        if(activeSegments>0){
            let currentSeg=0;
            const animInterval=setInterval(()=>{
                if(currentSeg<activeSegments){
                    lines[currentSeg].setAttribute('stroke','#1f6f78');
                    let pv=Math.round(((currentSeg+1)/totalSegments)*100);
                    if(currentSeg===activeSegments-1)pv=percentage;
                    document.getElementById('productivity-val').textContent=pv+'%';
                    currentSeg++;
                } else { clearInterval(animInterval); document.getElementById('productivity-val').textContent=percentage+'%'; }
            },40);
        } else { document.getElementById('productivity-val').textContent='0%'; }
    };

    function updateChartsTheme(){ if(navLinks.dashboard.classList.contains('active'))renderDashboard(); }

    // ---- PROYECTOS ----
    let currentProjFilter = 'all';
    window.setProjectFilter = function(btn, filterType) {
        document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        currentProjFilter=filterType;
        renderProjectsList();
    };

    function renderProjectsList() {
        const list=document.getElementById('project-list'); list.innerHTML='';
        state.projects.forEach(p=>{
            let d=0; p.tasks.forEach(t=>{ if(t.status==='done')d++; });
            let progress=p.tasks.length>0?Math.round((d/p.tasks.length)*100):0;
            const startDate = p.start_date || p.startDate || '';
            const endDate   = p.end_date   || p.endDate   || '';
            const wStart    = p.warranty_start || p.warrantyStart || '';
            const wEnd      = p.warranty_end   || p.warrantyEnd   || '';
            if(currentProjFilter==='active'&&progress===100&&p.tasks.length>0)return;
            if(currentProjFilter==='done'&&(progress<100||p.tasks.length===0))return;
            if(currentProjFilter==='warranty'&&!(wStart||wEnd))return;
            let datesHtml='';
            if(startDate||endDate){
                datesHtml+=`<div style="display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted);background:var(--main-bg);padding:0.3rem 0.5rem;border-radius:6px;"><span><span style="color:var(--text-main);font-weight:500;">Inicio:</span> ${escapeHtml(startDate||'--')}</span><span><span style="color:var(--text-main);font-weight:500;">Fin:</span> ${escapeHtml(endDate||'--')}</span></div>`;
            }
            if(wStart||wEnd){
                datesHtml+=`<div style="display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted);background:rgba(63, 125, 88,0.1);padding:0.3rem 0.5rem;border-radius:6px;"><span><span style="color:#3f7d58;font-weight:500;">Garantía Inc:</span> ${escapeHtml(wStart||'--')}</span><span><span style="color:#3f7d58;font-weight:500;">Garantía Fin:</span> ${escapeHtml(wEnd||'--')}</span></div>`;
            }
            const hasWarranty = !!(wStart || wEnd);
            const el=document.createElement('div'); el.className='col';
            el.innerHTML=`<div class="project-card" onclick="openProject('${p.id}')"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;"><div style="width:42px;height:42px;border-radius:12px;background:var(--main-bg);color:var(--sidebar-active);display:flex;align-items:center;justify-content:center;"><svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></div><div style="display:flex;align-items:center;gap:8px;"><span class="metric-badge" style="background:var(--main-bg);color:var(--text-muted);font-size:0.75rem;">${progress}%</span><button class="btn-action-icon" style="padding:4px;${hasWarranty ? 'color:#3f7d58;' : ''}" onclick="openEditWarranty('${p.id}',event)" title="${hasWarranty ? 'Garantía asignada' : 'Asignar garantía'}"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></button><button class="btn-action-icon btn-action-delete" style="padding:4px;" onclick="deleteProject('${p.id}',event)" title="Eliminar Proyecto">${ICON_TRASH}</button></div></div><h5 style="color:var(--text-main);font-weight:600;margin-bottom:0.2rem;">${escapeHtml(p.name)}</h5><p class="text-muted small m-0">${p.tasks.length} Tareas</p>${datesHtml}<div style="width:100%;background-color:var(--border-color);height:6px;border-radius:4px;margin-top:1rem;overflow:hidden;"><div style="width:${progress}%;background-color:${progress===100?'#3f7d58':'var(--sidebar-active)'};height:100%;transition:width 0.3s ease;"></div></div></div>`;
            list.appendChild(el);
        });
    }

    window.openProject = function(id) {
        state.currentProjectId = id;
        const p = state.projects.find(x=>x.id===id);
        showView('board', p ? `Tareas: ${p.name}` : 'Tareas', 'Gestión de Kanban');
        renderBoard();
    };

    window.deleteProject = async function(id, event) {
        event.stopPropagation();
        if(confirm("¿Estás seguro de que deseas eliminar este proyecto y todas sus tareas?")){
            const p=state.projects.find(x=>x.id===id);
            try {
                await api.deleteProject(id);
                if(p&&window.logActivity) window.logActivity('Proyecto Eliminado', p.name);
                state.projects=state.projects.filter(p=>p.id!==id);
                if(state.currentProjectId===id){
                    state.currentProjectId=state.projects.length>0?state.projects[0].id:null;
                }
                renderProjectsList();
                if (navLinks.pipeline.classList.contains('active')) renderPipeline();
                if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            } catch(e){ alert('Error al eliminar el proyecto: '+e.message); }
        }
    };

    // Modal proyecto
    const addProjectModal = new bootstrap.Modal(document.getElementById('addProjectModal'));
    document.getElementById('add-project-btn').addEventListener('click', async () => {
        const name=document.getElementById('new-project-name').value.trim();
        if(!name)return;
        const start_date=document.getElementById('new-project-start').value;
        const end_date=document.getElementById('new-project-end').value;
        try {
            const newProj = await api.createProject({ name, status: 'lead', start_date, end_date });
            state.projects.push(newProj);
            state.currentProjectId = newProj.id;
            if(window.logActivity) window.logActivity('Proyecto Creado', name);
            addProjectModal.hide();
            document.getElementById('new-project-name').value='';
            document.getElementById('new-project-start').value='';
            document.getElementById('new-project-end').value='';
            renderProjectsList();
            if (navLinks.pipeline.classList.contains('active')) renderPipeline();
            if(navLinks.dashboard.classList.contains('active'))renderDashboard();
        } catch(e){ alert('Error al crear proyecto: '+e.message); }
    });

    // ---- TABLERO KANBAN ----
    // "Mis Tareas" (global, todos los proyectos) y el tablero de un proyecto
    // puntual comparten las mismas columnas del DOM; boardMode dice cuál de
    // los dos está activo, para saber qué renderizar y a dónde volver tras
    // arrastrar/editar/eliminar una tarea.
    let boardMode = 'global';

    function findTaskAndProject(taskId) {
        for (const proj of state.projects) {
            const t = proj.tasks.find(x => x.id === taskId);
            if (t) return { project: proj, task: t };
        }
        return { project: null, task: null };
    }

    function setTaskCreationVisible(visible) {
        // refreshBoardView() se llama tras guardar/borrar una tarea para
        // mantener el tablero al día aunque no esté a la vista (p. ej. desde
        // el Calendario) — sin este chequeo, ese refresco en segundo plano
        // hacía aparecer el FAB "+ Nueva Tarea" encima de la vista activa.
        const fab = document.getElementById('fab-add-task');
        if (fab && navLinks.board.classList.contains('active')) {
            fab.style.display = visible ? 'flex' : 'none';
        }
        document.querySelectorAll('.add-task-inline').forEach((btn) => {
            btn.style.display = visible ? '' : 'none';
        });
    }

    function renderBoard() {
        const p=state.projects.find(x=>x.id===state.currentProjectId); if(!p)return;
        boardMode = 'project';
        setTaskCreationVisible(true);
        document.getElementById('view-project-tasks').textContent=`Tareas: ${p.name}`;
        ['todo','inprogress','done','paused'].forEach(s=>{
            document.getElementById(`${s}-list`).innerHTML='';
            document.getElementById(`count-${s}`).textContent='0';
        });
        let counts={todo:0,inprogress:0,done:0,paused:0};
        p.tasks.forEach(t=>{
            counts[t.status]++;
            const card=document.createElement('div'); card.className='task-card'; card.dataset.id=t.id;
            const dateHtml=t.dueDate?`<div style="margin-bottom:4px;">${ICON_CALENDAR} ${escapeHtml(t.dueDate)}</div>`:'';
            card.innerHTML=`<div class="task-title">${escapeHtml(t.title)}</div><div class="task-footer"><div class="task-meta">${dateHtml}<span class="priority-badge priority-${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span></div><div class="d-flex"><button class="btn-action-icon btn-action-delete" onclick="deleteTaskDirectly('${t.id}',event)" title="Eliminar">${ICON_TRASH}</button><button class="btn-action-icon" onclick="editTask('${t.id}',event)" title="Editar">${ICON_EDIT}</button></div></div>`;
            document.getElementById(`${t.status}-list`).appendChild(card);
        });
        Object.keys(counts).forEach(k=>document.getElementById(`count-${k}`).textContent=counts[k]);
    }

    // "Mis Tareas": agrega las tareas de TODOS los proyectos en un solo
    // tablero, cada tarjeta rotulada con su proyecto. Antes el ítem de menú
    // "Tareas" en realidad solo mostraba el último proyecto abierto, sin
    // decir cuál — esto es lo que de verdad pide un "todas mis tareas".
    function renderGlobalBoard() {
        boardMode = 'global';
        // El modal ya sabe preguntar a qué proyecto va una tarea nueva
        // cuando no hay uno obvio, así que crear desde aquí también funciona.
        setTaskCreationVisible(true);
        const subNav = document.getElementById('view-project-tasks');
        if (subNav) subNav.textContent = 'Mis Tareas';
        ['todo','inprogress','done','paused'].forEach(s=>{
            document.getElementById(`${s}-list`).innerHTML='';
            document.getElementById(`count-${s}`).textContent='0';
        });
        let counts={todo:0,inprogress:0,done:0,paused:0};
        state.projects.forEach(p=>{
            p.tasks.forEach(t=>{
                counts[t.status]++;
                const card=document.createElement('div'); card.className='task-card'; card.dataset.id=t.id;
                const dateHtml=t.dueDate?`<div style="margin-bottom:4px;">${ICON_CALENDAR} ${escapeHtml(t.dueDate)}</div>`:'';
                card.innerHTML=`<div class="task-title">${escapeHtml(t.title)}</div><div class="task-project-tag">${escapeHtml(p.name)}</div><div class="task-footer"><div class="task-meta">${dateHtml}<span class="priority-badge priority-${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span></div><div class="d-flex"><button class="btn-action-icon btn-action-delete" onclick="deleteTaskDirectly('${t.id}',event)" title="Eliminar">${ICON_TRASH}</button><button class="btn-action-icon" onclick="editTask('${t.id}',event)" title="Editar">${ICON_EDIT}</button></div></div>`;
                document.getElementById(`${t.status}-list`).appendChild(card);
            });
        });
        Object.keys(counts).forEach(k=>document.getElementById(`count-${k}`).textContent=counts[k]);
    }

    function refreshBoardView() {
        if (boardMode === 'global') renderGlobalBoard(); else renderBoard();
    }

    // Drag & Drop Kanban (funciona igual en modo proyecto y en "Mis Tareas")
    ['todo','inprogress','done','paused'].forEach(s=>{
        new Sortable(document.getElementById(`${s}-list`),{
            group:'kanban', animation:150,
            onEnd: async (evt)=>{
                const tId=evt.item.dataset.id;
                const nStat=evt.to.id.replace('-list','');
                const { task: t } = findTaskAndProject(tId);
                if(t&&t.status!==nStat){
                    t.status=nStat;
                    try {
                        await api.updateTask(tId, { ...t, due_date: t.dueDate });
                        refreshBoardView();
                    } catch(e){ console.error('Error actualizando tarea:', e); }
                }
            }
        });
    });

    // Cuando se crea una tarea sin un proyecto obvio (desde "Mis Tareas" o
    // desde el Calendario), el modal necesita preguntar a qué proyecto va.
    // Dentro del tablero de un proyecto puntual esa pregunta sobra: se usa
    // directamente state.currentProjectId.
    function openNewTaskModal(status, presetDate) {
        document.getElementById('task-id-input').value='';
        document.getElementById('task-title-input').value='';
        document.getElementById('task-description-input').value='';
        document.getElementById('task-priority-input').value='Media';
        document.getElementById('task-due-date-input').value=presetDate||'';
        document.getElementById('task-status-input').value=status||'todo';

        const projectField = document.getElementById('task-project-field');
        const projectSelect = document.getElementById('task-project-input');
        const currentProject = state.projects.find(x=>x.id===state.currentProjectId);
        const needsProjectPicker = !(boardMode==='project' && currentProject);
        if (needsProjectPicker) {
            projectField.style.display = '';
            projectSelect.innerHTML = state.projects.length
                ? state.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
                : '<option value="">Crea un proyecto primero</option>';
        } else {
            projectField.style.display = 'none';
        }

        const modal=new bootstrap.Modal(document.getElementById('taskDetailModal'));
        modal.show();
    }

    // FAB — Nueva Tarea
    document.getElementById('fab-add-task').addEventListener('click', ()=>openNewTaskModal('todo'));

    // Botones "+ Nueva tarea" de cada columna del Kanban (llamado desde el
    // HTML). Antes no existía esta función: el botón tiraba un error y no
    // hacía nada.
    window.openQuickTask = function(status) {
        openNewTaskModal(status);
    };

    // Guardar tarea (crear o actualizar)
    document.getElementById('save-task-details-btn').addEventListener('click', async ()=>{
        const id=document.getElementById('task-id-input').value;
        const taskData={
            title:document.getElementById('task-title-input').value.trim(),
            description:document.getElementById('task-description-input').value,
            priority:document.getElementById('task-priority-input').value,
            dueDate:document.getElementById('task-due-date-input').value,
            status:document.getElementById('task-status-input').value||'todo'
        };
        if(!taskData.title)return;
        try {
            if(id){
                // Actualizar (busca en todos los proyectos: puede venir de "Mis Tareas")
                const { task: t } = findTaskAndProject(id);
                await api.updateTask(id, taskData);
                if(t){ Object.assign(t, taskData); }
                if(window.logActivity)window.logActivity('Tarea Actualizada', taskData.title);
            } else {
                // Crear: el proyecto viene del selector (Mis Tareas/Calendario)
                // o, si estaba oculto, del proyecto actual del tablero.
                const projectFieldVisible = document.getElementById('task-project-field').style.display !== 'none';
                const projectId = projectFieldVisible
                    ? document.getElementById('task-project-input').value
                    : state.currentProjectId;
                const p=state.projects.find(x=>x.id===projectId);
                if(!p){ alert('Elige un proyecto para la tarea.'); return; }
                const newTask=await api.createTask(p.id, taskData);
                p.tasks.push(newTask);
                if(window.logActivity)window.logActivity('Tarea Creada', taskData.title);
            }
            bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide();
            refreshBoardView();
            if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            if(navLinks.calendar.classList.contains('active'))renderCalendar();
        } catch(e){ alert('Error al guardar tarea: '+e.message); }
    });

    // Eliminar tarea desde modal
    document.getElementById('delete-task-btn').addEventListener('click', async ()=>{
        const id=document.getElementById('task-id-input').value;
        if(!id)return;
        if(confirm('¿Eliminar esta tarea?')){
            const { project: p } = findTaskAndProject(id);
            try {
                await api.deleteTask(id);
                if(p) p.tasks=p.tasks.filter(t=>t.id!==id);
                bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide();
                refreshBoardView();
                if(navLinks.calendar.classList.contains('active'))renderCalendar();
            } catch(e){ alert('Error al eliminar tarea: '+e.message); }
        }
    });

    window.editTask = function(id, event) {
        if(event)event.stopPropagation();
        const { task: t } = findTaskAndProject(id);
        if(!t)return;
        document.getElementById('task-id-input').value=t.id;
        document.getElementById('task-title-input').value=t.title;
        document.getElementById('task-description-input').value=t.description||'';
        document.getElementById('task-priority-input').value=t.priority||'Media';
        document.getElementById('task-due-date-input').value=t.dueDate||'';
        document.getElementById('task-status-input').value=t.status||'todo';
        const modal=new bootstrap.Modal(document.getElementById('taskDetailModal'));
        modal.show();
    };

    window.deleteTaskDirectly = async function(id, event) {
        if(event)event.stopPropagation();
        if(confirm('¿Eliminar esta tarea?')){
            const { project: p } = findTaskAndProject(id);
            try {
                await api.deleteTask(id);
                if(p)p.tasks=p.tasks.filter(t=>t.id!==id);
                refreshBoardView();
                if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            } catch(e){ alert('Error al eliminar tarea: '+e.message); }
        }
    };

    // ---- CALENDARIO ----
    let calendar;
    function renderCalendar() {
        const calEl=document.getElementById('calendar-container'); let events=[];
        const colorPalette=['#38a6ae','#3e6e93','#b98a2e','#3f7d58','#1f7d87','#b4453d','#3f8f86','#1f7d87'];
        state.projects.forEach((p,idx)=>{
            const projColor=colorPalette[idx%colorPalette.length];
            p.tasks.forEach(t=>{
                if(t.dueDate){
                    events.push({id:t.id,title:t.title,start:t.dueDate,backgroundColor:projColor,borderColor:projColor,extendedProps:{projId:p.id}});
                }
            });
        });
        if(calendar)calendar.destroy();
        calendar=new FullCalendar.Calendar(calEl,{
            initialView:'dayGridMonth', locale:'es',
            headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek'},
            // Los botones nunca se tradujeron pese a locale:'es' (se
            // quedaban en "today/month/week" en inglés).
            buttonText:{ today:'Hoy', month:'Mes', week:'Semana', day:'Día', list:'Lista' },
            events, height:650,
            dateClick:function(info){ openNewTaskModal('todo', info.dateStr); },
            eventClick:function(info){ state.currentProjectId=info.event.extendedProps.projId; window.editTask(info.event.id,new Event('click')); }
        });
        setTimeout(()=>{calendar.render();},150);
    }

    // ---- GARANTÍAS ----
    // Antes era una vista propia en el menú (una tarjeta por proyecto solo
    // para ver/editar 2 fechas). Ahora se asigna desde el ícono de escudo en
    // la propia tarjeta de Proyectos, y se filtra ahí con "En Garantía".
    const editWarrantyModal=new bootstrap.Modal(document.getElementById('editWarrantyModal'));
    window.openEditWarranty=function(id,event){
        if(event)event.stopPropagation();
        const p=state.projects.find(x=>x.id===id);
        if(p){
            document.getElementById('warranty-project-id').value=id;
            document.getElementById('warranty-start-input').value=p.warranty_start||p.warrantyStart||'';
            document.getElementById('warranty-end-input').value=p.warranty_end||p.warrantyEnd||'';
            editWarrantyModal.show();
        }
    };
    document.getElementById('save-warranty-btn').addEventListener('click', async ()=>{
        const id=document.getElementById('warranty-project-id').value;
        const p=state.projects.find(x=>x.id===id);
        if(p){
            const warranty_start=document.getElementById('warranty-start-input').value;
            const warranty_end=document.getElementById('warranty-end-input').value;
            try {
                await api.updateProject(id,{
                    name:p.name, status:p.status,
                    start_date:p.start_date||p.startDate||'',
                    end_date:p.end_date||p.endDate||'',
                    warranty_start, warranty_end
                });
                p.warranty_start=warranty_start; p.warrantyStart=warranty_start;
                p.warranty_end=warranty_end;   p.warrantyEnd=warranty_end;
                if(window.logActivity)window.logActivity('Garantía Actualizada', p.name);
                editWarrantyModal.hide();
                renderProjectsList();
            } catch(e){ alert('Error actualizando garantía: '+e.message); }
        }
    });

    // ---- FINANZAS ----
    let currentFinanceFilter = 'all';
    window.setFinanceFilter = function(btn, filterType) {
        document.querySelectorAll('#finance-filters .filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        currentFinanceFilter = filterType;
        renderFinances();
    };

    // Antes no había forma de ver qué proyecto/cliente generó cada ingreso
    // en conjunto — esto es lo que hace útil el valor en $ que ya se
    // muestra en el Pipeline.
    function renderFinanceByProject() {
        const container = document.getElementById('finance-by-project');
        if (!container) return;
        const totals = new Map();
        state.finances.forEach((f) => {
            if (f.type !== 'income') return;
            const key = f.project_id || '';
            totals.set(key, (totals.get(key) || 0) + (parseFloat(f.amount) || 0));
        });
        const rows = [...totals.entries()]
            .map(([projectId, amount]) => ({
                name: projectId ? (state.projects.find((p) => String(p.id) === String(projectId))?.name || 'Proyecto eliminado') : 'Sin proyecto asignado',
                amount,
            }))
            .sort((a, b) => b.amount - a.amount);
        container.innerHTML = rows.length
            ? rows.map((r) => `<div class="custom-list-item"><div class="item-left">${escapeHtml(r.name)}</div><div class="item-right">$${r.amount.toFixed(2)}</div></div>`).join('')
            : '<p class="text-muted small mt-2">Todavía no hay ingresos registrados.</p>';
    }

    function populateFinanceProjectSelect(selectedId) {
        const sel = document.getElementById('fin-project-input');
        if (!sel) return;
        sel.innerHTML = '<option value="">Sin proyecto</option>' +
            state.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
        sel.value = selectedId || '';
    }

    function renderFinances() {
        const tbody = document.getElementById('finance-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let inc=0,exp=0;
        state.finances.forEach(f=>{
            if(f.type==='income')inc+=parseFloat(f.amount);else exp+=parseFloat(f.amount);
        });
        const filtered = state.finances.filter((f) => currentFinanceFilter === 'all' || f.type === currentFinanceFilter);
        filtered.forEach(f=>{
            const project = state.projects.find((p) => String(p.id) === String(f.project_id));
            const tr=document.createElement('tr');
            tr.innerHTML=`<td>${escapeHtml(f.date)}</td><td>${escapeHtml(f.concept)}</td><td>${project ? escapeHtml(project.name) : '<span class="text-muted">—</span>'}</td><td><span class="metric-badge" style="background:${f.type==='income'?'rgba(63, 125, 88,0.1)':'rgba(180, 69, 61,0.1)'};color:${f.type==='income'?'#3f7d58':'#b4453d'}">${f.type==='income'?'Ingreso':'Gasto'}</span></td><td style="color:${f.type==='income'?'#3f7d58':'#b4453d'};font-weight:600;">${f.type==='income'?'+':'-'}$${parseFloat(f.amount).toFixed(2)}</td><td class="text-end text-nowrap"><button class="btn-action-icon" onclick="editFinance('${f.id}')" title="Editar">${ICON_EDIT}</button><button class="btn-action-icon btn-action-delete" onclick="deleteFinance('${f.id}')" title="Eliminar">${ICON_TRASH}</button></td>`;
            tbody.appendChild(tr);
        });
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted small">No hay movimientos que coincidan con este filtro.</td></tr>';
        }
        const incomeEl = document.getElementById('fin-income');
        const expenseEl = document.getElementById('fin-expense');
        const balanceEl = document.getElementById('fin-balance');
        if (incomeEl) incomeEl.textContent = `$${inc.toFixed(2)}`;
        if (expenseEl) expenseEl.textContent = `$${exp.toFixed(2)}`;
        if (balanceEl) balanceEl.textContent = `$${(inc-exp).toFixed(2)}`;
        renderFinanceByProject();
    }

    const addFinanceModal=new bootstrap.Modal(document.getElementById('addFinanceModal'));

    // "+ Nuevo Movimiento" siempre debe abrir el modal en blanco, aunque el
    // usuario acabe de editar otro movimiento.
    document.getElementById('new-finance-btn').addEventListener('click', () => {
        document.getElementById('fin-id-input').value = '';
        document.getElementById('finance-modal-title').textContent = 'Nuevo Movimiento';
        document.getElementById('fin-concept-input').value = '';
        document.getElementById('fin-type-input').value = 'income';
        document.getElementById('fin-amount-input').value = '';
        document.getElementById('fin-date-input').value = '';
        populateFinanceProjectSelect();
        document.getElementById('delete-finance-btn').style.display = 'none';
    });

    window.editFinance = function(id) {
        const f = state.finances.find((x) => x.id === id);
        if (!f) return;
        document.getElementById('fin-id-input').value = f.id;
        document.getElementById('finance-modal-title').textContent = 'Editar Movimiento';
        document.getElementById('fin-concept-input').value = f.concept;
        document.getElementById('fin-type-input').value = f.type;
        document.getElementById('fin-amount-input').value = f.amount;
        document.getElementById('fin-date-input').value = f.date;
        populateFinanceProjectSelect(f.project_id);
        document.getElementById('delete-finance-btn').style.display = '';
        addFinanceModal.show();
    };

    document.getElementById('add-finance-btn').addEventListener('click', async ()=>{
        const id=document.getElementById('fin-id-input').value;
        const concept=document.getElementById('fin-concept-input').value.trim();
        const type=document.getElementById('fin-type-input').value;
        const amount=parseFloat(document.getElementById('fin-amount-input').value);
        const date=document.getElementById('fin-date-input').value;
        const project_id=document.getElementById('fin-project-input').value || null;
        if(!concept||!amount||!date)return;
        try {
            if (id) {
                await api.updateFinance(id, { concept, type, amount, date, project_id });
                const f = state.finances.find((x) => x.id === id);
                if (f) Object.assign(f, { concept, type, amount, date, project_id });
                if(window.logActivity)window.logActivity('Movimiento Actualizado', `${concept} - $${amount}`);
            } else {
                const newFin=await api.createFinance({concept,type,amount,date,project_id});
                state.finances.unshift(newFin);
                if(window.logActivity)window.logActivity('Movimiento Registrado', `${concept} - $${amount}`);
            }
            addFinanceModal.hide();
            renderFinances();
            if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            if(navLinks.pipeline.classList.contains('active'))renderPipeline();
        } catch(e){ alert('Error al guardar movimiento: '+e.message); }
    });

    document.getElementById('delete-finance-btn').addEventListener('click', async () => {
        const id = document.getElementById('fin-id-input').value;
        if (!id || !confirm('¿Eliminar este movimiento?')) return;
        try {
            await api.deleteFinance(id);
            state.finances = state.finances.filter((f) => f.id !== id);
            addFinanceModal.hide();
            renderFinances();
            if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            if(navLinks.pipeline.classList.contains('active'))renderPipeline();
        } catch(e){ alert('Error al eliminar: '+e.message); }
    });

    window.deleteFinance=async function(id){
        if(confirm('¿Eliminar este movimiento?')){
            try {
                await api.deleteFinance(id);
                state.finances=state.finances.filter(f=>f.id!==id);
                renderFinances();
                if(navLinks.dashboard.classList.contains('active'))renderDashboard();
                if(navLinks.pipeline.classList.contains('active'))renderPipeline();
            } catch(e){ alert('Error al eliminar: '+e.message); }
        }
    };

    // ---- PIPELINE ----
    const PIPELINE_STAGES = ['lead', 'negotiation', 'execution', 'delivered'];

    function projectPipelineValue(project) {
        return state.finances
            .filter((f) => f.type === 'income' && f.project_id != null && String(f.project_id) === String(project.id))
            .reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);
    }

    function formatMoney(amount) {
        return `$${amount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`;
    }

    function renderPipeline() {
        PIPELINE_STAGES.forEach((stage) => {
            const col = document.getElementById(`pipe-${stage}`);
            if (!col) return;
            col.innerHTML = '';
            const projectsInStage = state.projects.filter((p) => p.status === stage);
            let stageValue = 0;

            projectsInStage.forEach((p) => {
                const value = projectPipelineValue(p);
                stageValue += value;
                const card = document.createElement('div');
                card.className = 'task-card pipeline-card mb-2';
                card.dataset.id = p.id;
                card.innerHTML = `
                    <div class="task-title">${escapeHtml(p.name)}</div>
                    <div class="task-footer">
                        <div class="task-meta"><small style="color:var(--text-muted);">${p.tasks.length} tareas</small></div>
                        ${value > 0 ? `<span class="pipeline-value">${formatMoney(value)}</span>` : ''}
                    </div>`;
                col.appendChild(card);
            });

            if (!projectsInStage.length) {
                col.innerHTML = '<p class="text-muted small text-center mt-3 mb-0" style="padding: 0 0.5rem;">Sin proyectos aquí</p>';
            }

            const totalEl = document.getElementById(`pipe-total-${stage}`);
            if (totalEl) {
                totalEl.textContent = stageValue > 0 ? formatMoney(stageValue) : String(projectsInStage.length);
            }
        });
    }

    // Drag & Drop entre etapas del pipeline: antes esta vista solo mostraba
    // proyectos (y con un bug de IDs, ni eso); ahora arrastrar una tarjeta
    // actualiza de verdad el status del proyecto en la base de datos.
    PIPELINE_STAGES.forEach((stage) => {
        const el = document.getElementById(`pipe-${stage}`);
        if (!el) return;
        new Sortable(el, {
            group: 'pipeline',
            animation: 150,
            onEnd: async (evt) => {
                const projectId = evt.item.dataset.id;
                const newStatus = evt.to.id.replace('pipe-', '');
                const project = state.projects.find((p) => String(p.id) === String(projectId));
                if (!project || project.status === newStatus) return;
                const previousStatus = project.status;
                project.status = newStatus;
                try {
                    await api.updateProject(projectId, {
                        name: project.name,
                        status: newStatus,
                        start_date: project.start_date || project.startDate || '',
                        end_date: project.end_date || project.endDate || '',
                        warranty_start: project.warranty_start || project.warrantyStart || '',
                        warranty_end: project.warranty_end || project.warrantyEnd || '',
                    });
                    if (window.logActivity) window.logActivity('Proyecto movido en el Pipeline', project.name);
                    if (navLinks.dashboard.classList.contains('active')) renderDashboard();
                } catch (e) {
                    console.error('Error moviendo proyecto en el pipeline:', e);
                    project.status = previousStatus; // revertir si falló el guardado
                }
                renderPipeline();
            },
        });
    });


// ---- NOTAS ----
let currentNoteFolder = 'General';

const folderPalette = ['#1f6f78', '#2f6e94', '#3f7d58', '#b98a2e', '#38a6ae', '#b4453d', '#3f8f86', '#6b4a86'];

function fallbackFolderColor(name) {
    const key = String(name || 'General').toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return folderPalette[hash % folderPalette.length];
}

function getFolderColor(name) {
    return state.noteFolderColors?.[name] || fallbackFolderColor(name);
}

function setNoteColorDefault(folderName) {
    const input = document.getElementById('note-color-input');
    if (!input) return;
    const color = getFolderColor(folderName);
    input.value = color;
    input.dataset.defaultColor = color;
}

function renderNoteFolderTabs() {
        const tabs=document.getElementById('notes-folders-tabs'); if(!tabs)return; tabs.innerHTML='';
        state.noteFolders.forEach(f=>{
            const btn=document.createElement('button');
            const folderColor = getFolderColor(f);
            btn.className='btn btn-sm note-folder-tab';
            btn.style.setProperty('--folder-accent', folderColor);
            btn.classList.toggle('active', f===currentNoteFolder);
            btn.textContent=f;
            btn.onclick=()=>{ currentNoteFolder=f; renderNoteFolderTabs(); renderNotesList(); };
            tabs.appendChild(btn);
        });
    }

    function renderNotesList() {
        const list=document.getElementById('notes-list'); if(!list)return; list.innerHTML='';
        // Con texto en el buscador, se busca por nombre en TODAS las
        // carpetas (para eso sirve: no tener que ir carpeta por carpeta).
        // Vacío el buscador, vuelve a filtrar solo por la carpeta activa.
        const searchInput = document.getElementById('notes-search-input');
        const query = (searchInput?.value || '').trim().toLowerCase();
        const searching = query.length > 0;
        const filtered = searching
            ? state.notes.filter(n => n.title.toLowerCase().includes(query))
            : state.notes.filter(n => n.folder === currentNoteFolder);
        const tabsEl = document.getElementById('notes-folders-tabs');
        if (tabsEl) tabsEl.style.opacity = searching ? '0.4' : '1';
        filtered.forEach(n=>{
            const div=document.createElement('div');
            div.className = 'note-folder-card';
            div.style.setProperty('--note-accent', n.color || getFolderColor(n.folder) || '#1f6f78');
            div.innerHTML = `
                <div class="note-folder-card-top">
                    <div class="note-folder-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <path d="M14 2v6h6"></path>
                            <path d="M9 13h6M9 17h6"></path>
                        </svg>
                    </div>
                    <button class="btn-action-icon btn-action-delete" onclick="deleteNote('${n.id}',event)">${ICON_TRASH}</button>
                </div>
                <div class="note-folder-card-body">
                    <strong class="note-folder-card-title">${escapeHtml(n.title)}</strong>
                    <span class="note-folder-card-folder">${escapeHtml(n.folder || 'General')}</span>
                </div>
                <div class="note-folder-card-footer">Abrir nota →</div>`;
            div.onclick=()=>openEditNote(n);
            list.appendChild(div);
        });
        if(filtered.length===0){
            list.innerHTML = searching
                ? `<p class="text-muted small">Ninguna nota coincide con "${escapeHtml(query)}".</p>`
                : '<p class="text-muted small">No hay notas en esta carpeta.</p>';
        }
    }

    const addNoteModal=new bootstrap.Modal(document.getElementById('addNoteModal'));
    function populateFolderSelect(){
        const sel=document.getElementById('note-folder-input'); sel.innerHTML='';
        state.noteFolders.forEach(f=>{ const opt=document.createElement('option'); opt.value=f; opt.textContent=f; sel.appendChild(opt); });
        sel.value=currentNoteFolder;
    }

    window.addNote=function(){
        document.getElementById('note-id-input').value='';
        document.getElementById('note-title-input').value='';
        document.getElementById('note-content-input').value='';
        populateFolderSelect();
        setNoteColorDefault(currentNoteFolder);
        addNoteModal.show();
    };

    function openEditNote(n){
        document.getElementById('note-id-input').value=n.id;
        document.getElementById('note-title-input').value=n.title;
        document.getElementById('note-content-input').value=n.content||'';
        populateFolderSelect();
        document.getElementById('note-folder-input').value=n.folder||'General';
        setNoteColorDefault(n.folder||'General');
        document.getElementById('note-color-input').value=n.color||getFolderColor(n.folder||'General')||'#1f6f78';
        addNoteModal.show();
    }

    document.getElementById('save-note-btn').addEventListener('click', async ()=>{
        const id=document.getElementById('note-id-input').value;
        const noteData={
            title:document.getElementById('note-title-input').value.trim(),
            content:document.getElementById('note-content-input').value,
            folder:document.getElementById('note-folder-input').value,
            color:document.getElementById('note-color-input').value
        };
        if(!noteData.title)return;
        try {
            if(id){
                await api.updateNote(id,noteData);
                const n=state.notes.find(x=>x.id===id);
                if(n)Object.assign(n,noteData);
            } else {
                const newNote=await api.createNote(noteData);
                state.notes.unshift(newNote);
                if(window.logActivity)window.logActivity('Nota Creada', noteData.title);
            }
            addNoteModal.hide();
            renderNotesList();
        } catch(e){ alert('Error al guardar nota: '+e.message); }
    });

    window.deleteNote=async function(id,event){
        if(event)event.stopPropagation();
        if(confirm('¿Eliminar esta nota?')){
            try {
                await api.deleteNote(id);
                state.notes=state.notes.filter(n=>n.id!==id);
                renderNotesList();
            } catch(e){ alert('Error al eliminar nota: '+e.message); }
        }
    };

    window.promptNewFolder=async function(){
        const name=prompt('Nombre de la nueva carpeta:');
        if(name&&name.trim()&&!state.noteFolders.includes(name.trim())){
            const normalizedName = name.trim();
            const defaultColor = getFolderColor(normalizedName);
            const color = (prompt('Color de la carpeta en hex (#1f6f78):', defaultColor) || defaultColor).trim() || defaultColor;
            try {
                await api.createFolder(normalizedName, color);
                state.noteFolders.push(normalizedName);
                state.noteFolderColors[normalizedName] = color;
                await api.saveSetting('noteFolderColors', JSON.stringify(state.noteFolderColors));
                renderNoteFolderTabs();
            } catch(e){ alert('Error al crear carpeta: '+e.message); }
        }
    };

    document.getElementById('note-folder-input').addEventListener('change', (event) => {
        setNoteColorDefault(event.target.value);
    });

    // ---- INTEGRACIONES ----
    const integrationModalEl = document.getElementById('integrationModal');
    const integrationModal = integrationModalEl ? new bootstrap.Modal(integrationModalEl) : null;
    const integrationEventOptions = [
        { value: 'all', label: 'Todos' },
        { value: 'project.created', label: 'Proyecto creado' },
        { value: 'project.updated', label: 'Proyecto actualizado' },
        { value: 'project.deleted', label: 'Proyecto eliminado' },
        { value: 'task.created', label: 'Tarea creada' },
        { value: 'task.updated', label: 'Tarea actualizada' },
        { value: 'task.deleted', label: 'Tarea eliminada' },
        { value: 'finance.created', label: 'Movimiento creado' },
        { value: 'finance.deleted', label: 'Movimiento eliminado' },
        { value: 'note.created', label: 'Nota creada' },
        { value: 'note.updated', label: 'Nota actualizada' },
        { value: 'note.deleted', label: 'Nota eliminada' },
        { value: 'folder.created', label: 'Carpeta creada' },
        { value: 'business.email.received', label: 'Correo de negocio recibido' }
    ];
    let currentIntegrationId = '';

    function selectedIntegrationEvents() {
        const container = document.getElementById('integration-events-inputs');
        if (!container) return ['all'];
        const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
        return checked.length ? checked : ['all'];
    }

    function renderIntegrationEventInputs(selected = ['all']) {
        const container = document.getElementById('integration-events-inputs');
        if (!container) return;
        container.innerHTML = '';
        integrationEventOptions.forEach((item) => {
            const wrap = document.createElement('label');
            wrap.className = 'badge rounded-pill text-dark border d-inline-flex align-items-center gap-2 p-2';
            wrap.style.cursor = 'pointer';
            wrap.style.background = 'var(--card-bg)';
            wrap.style.borderColor = 'var(--border-color)';
            wrap.innerHTML = `
                <input type="checkbox" value="${item.value}" ${selected.includes(item.value) ? 'checked' : ''}>
                <span>${item.label}</span>
            `;
            container.appendChild(wrap);
        });
    }

    async function refreshIntegrationsState() {
        try {
            state.integrations = await api.getIntegrations();
        } catch {
            state.integrations = [];
        }
        try {
            state.integrationEvents = await api.getIntegrationEvents();
        } catch {
            state.integrationEvents = [];
        }
    }

    function renderIntegrations() {
        const list = document.getElementById('integration-list');
        const eventsBody = document.getElementById('integration-events-body');
        const countEl = document.getElementById('integration-count');
        const enabledEl = document.getElementById('integration-enabled-count');
        const eventCountEl = document.getElementById('integration-event-count');
        if (countEl) countEl.textContent = String(state.integrations.length);
        if (enabledEl) enabledEl.textContent = String(state.integrations.filter((item) => item.enabled).length);
        if (eventCountEl) eventCountEl.textContent = String(state.integrationEvents.length);

        if (list) {
            list.innerHTML = '';
            if (!state.integrations.length) {
                list.innerHTML = '<div class="col-12"><p class="text-muted small mb-0">Todavía no hay integraciones configuradas.</p></div>';
            } else {
                state.integrations.forEach((integration) => {
                    const col = document.createElement('div');
                    col.className = 'col';
                    const eventsLabel = (integration.events || []).map((event) => event === 'all' ? 'Todos' : escapeHtml(event)).join(', ');
                    col.innerHTML = `
                        <div class="dash-card h-100 p-3">
                            <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
                                <div>
                                    <div class="d-flex align-items-center gap-2 mb-1">
                                        <strong>${escapeHtml(integration.name || 'Integración sin nombre')}</strong>
                                        <span class="badge rounded-pill ${integration.enabled ? 'bg-success' : 'bg-secondary'}">${integration.enabled ? 'Activa' : 'Pausada'}</span>
                                    </div>
                                    <small class="text-muted text-uppercase">${escapeHtml(integration.type || 'webhook')}</small>
                                </div>
                                <button class="btn btn-sm btn-outline-danger" data-action="delete">Eliminar</button>
                            </div>
                            <div class="small text-muted mb-2" style="word-break: break-word;">${escapeHtml(integration.endpoint || 'Sin endpoint configurado')}</div>
                            <div class="small mb-3"><strong>Eventos:</strong> ${eventsLabel || 'Todos'}</div>
                            <div class="d-flex gap-2 flex-wrap">
                                <button class="btn btn-sm btn-outline-primary" data-action="edit">Editar</button>
                                <button class="btn btn-sm btn-primary" style="background-color: var(--sidebar-active); border:none;" data-action="test">Probar</button>
                            </div>
                        </div>`;
                    const [editBtn, testBtn, deleteBtn] = [
                        col.querySelector('[data-action="edit"]'),
                        col.querySelector('[data-action="test"]'),
                        col.querySelector('[data-action="delete"]')
                    ];
                    editBtn.addEventListener('click', () => openIntegrationModal(integration));
                    testBtn.addEventListener('click', async () => {
                        try {
                            await api.testIntegration(integration.id);
                            await refreshIntegrationsState();
                            renderIntegrations();
                            showToast(`Prueba enviada a ${integration.name}`);
                        } catch (err) {
                            alert('Error al probar integración: ' + err.message);
                        }
                    });
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm(`¿Eliminar la integración "${integration.name}"?`)) return;
                        try {
                            await api.deleteIntegration(integration.id);
                            await refreshIntegrationsState();
                            renderIntegrations();
                        } catch (err) {
                            alert('Error al eliminar integración: ' + err.message);
                        }
                    });
                    list.appendChild(col);
                });
            }
        }

        if (eventsBody) {
            eventsBody.innerHTML = '';
            if (!state.integrationEvents.length) {
                eventsBody.innerHTML = '<tr><td colspan="5" class="text-muted">Todavía no hay eventos registrados.</td></tr>';
            } else {
                state.integrationEvents.forEach((entry) => {
                    const integration = state.integrations.find((item) => String(item.id) === String(entry.integration_id));
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${entry.created_at ? new Date(entry.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '--'}</td>
                        <td>${escapeHtml(integration ? integration.name : entry.integration_id)}</td>
                        <td>${escapeHtml(entry.event_type || '--')}</td>
                        <td><span class="badge ${String(entry.status).startsWith('success') ? 'bg-success' : String(entry.status).startsWith('http_') ? 'bg-warning text-dark' : 'bg-danger'}">${escapeHtml(entry.status || 'unknown')}</span></td>
                        <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(entry.response || '--')}</td>`;
                    eventsBody.appendChild(tr);
                });
            }
        }
    }

    function openIntegrationModal(integration = null) {
        if (!integrationModal) return;
        currentIntegrationId = integration ? String(integration.id) : '';
        document.getElementById('integration-id-input').value = currentIntegrationId;
        document.getElementById('integration-name-input').value = integration?.name || '';
        document.getElementById('integration-type-input').value = integration?.type || 'webhook';
        document.getElementById('integration-endpoint-input').value = integration?.endpoint || '';
        document.getElementById('integration-secret-input').value = integration?.secret || '';
        document.getElementById('integration-enabled-input').checked = integration ? !!integration.enabled : true;
        renderIntegrationEventInputs(integration?.events || ['all']);
        document.getElementById('test-integration-btn').style.display = integration ? 'inline-flex' : 'none';
        document.getElementById('save-integration-btn').textContent = integration ? 'Guardar cambios' : 'Guardar';
        integrationModal.show();
    }

    window.openIntegrationModal = openIntegrationModal;

    document.getElementById('integration-events-inputs').addEventListener('change', (event) => {
        if (event.target && event.target.type === 'checkbox') {
            const container = document.getElementById('integration-events-inputs');
            const allBox = container.querySelector('input[value="all"]');
            const others = Array.from(container.querySelectorAll('input[type="checkbox"]')).filter((input) => input.value !== 'all');
            if (event.target.value === 'all' && event.target.checked) {
                others.forEach((input) => { input.checked = false; });
            } else if (event.target.value !== 'all' && event.target.checked && allBox) {
                allBox.checked = false;
            }
        }
    });

    document.getElementById('save-integration-btn').addEventListener('click', async () => {
        const payload = {
            name: document.getElementById('integration-name-input').value.trim(),
            type: document.getElementById('integration-type-input').value,
            endpoint: document.getElementById('integration-endpoint-input').value.trim(),
            secret: document.getElementById('integration-secret-input').value.trim(),
            enabled: document.getElementById('integration-enabled-input').checked,
            events: selectedIntegrationEvents(),
            method: 'POST'
        };
        if (!payload.name || !payload.endpoint) {
            alert('Nombre y endpoint son requeridos.');
            return;
        }
        try {
            if (currentIntegrationId) {
                await api.updateIntegration(currentIntegrationId, payload);
            } else {
                await api.createIntegration(payload);
            }
            await refreshIntegrationsState();
            renderIntegrations();
            integrationModal.hide();
            showToast(currentIntegrationId ? 'Integración actualizada' : 'Integración creada');
        } catch (err) {
            alert('Error guardando integración: ' + err.message);
        }
    });

    document.getElementById('test-integration-btn').addEventListener('click', async () => {
        if (!currentIntegrationId) return;
        try {
            await api.testIntegration(currentIntegrationId);
            await refreshIntegrationsState();
            renderIntegrations();
            showToast('Prueba enviada');
        } catch (err) {
            alert('Error al probar integración: ' + err.message);
        }
    });

    // ---- CORREO NEGOCIO ----
    const businessMailModalEl = document.getElementById('businessMailModal');
    const businessMailModal = businessMailModalEl ? new bootstrap.Modal(businessMailModalEl) : null;
    let currentBusinessMailId = '';

    async function refreshBusinessMailState() {
        try {
            state.businessNotifications = await api.getBusinessNotifications();
        } catch {
            state.businessNotifications = [];
        }
    }

    // Antes esta bandeja era de solo lectura: veías el correo, lo marcabas
    // leído y ahí terminaba — no había forma de convertir un correo real de
    // negocio en un proyecto del Pipeline. Se guarda el vínculo dentro de
    // "notes" (no hay una columna dedicada) para no crear el proyecto dos
    // veces si ya se convirtió.
    function convertedProjectId(mail) {
        const match = String(mail?.notes || '').match(/\[proyecto:([^\]]+)\]/);
        return match ? match[1] : null;
    }

    window.convertMailToProject = async function (id) {
        const mail = state.businessNotifications.find((item) => String(item.id) === String(id));
        if (!mail) return;

        const existingId = convertedProjectId(mail);
        if (existingId) {
            const existing = state.projects.find((p) => String(p.id) === String(existingId));
            if (existing) { window.openProject(existing.id); return; }
        }

        const defaultName = mail.from_name || mail.from_email || mail.subject || 'Nuevo prospecto';
        const name = prompt('Nombre del proyecto:', defaultName);
        if (!name || !name.trim()) return;

        try {
            const newProject = await api.createProject({ name: name.trim(), status: 'lead', start_date: '', end_date: '' });
            state.projects.push(newProject);
            const notesMarker = `[proyecto:${newProject.id}] Convertido desde el correo de ${mail.from_name || mail.from_email || 'remitente desconocido'}.`;
            await api.updateBusinessNotification(id, { is_read: true, notes: notesMarker });
            await refreshBusinessMailState();
            renderBusinessMail();
            if (String(currentBusinessMailId) === String(id)) {
                document.getElementById('business-mail-convert-btn').textContent = 'Ver proyecto';
            }
            if (navLinks.pipeline.classList.contains('active')) renderPipeline();
            if (window.logActivity) window.logActivity('Proyecto creado desde correo', name.trim());
            showToast(`Proyecto "${name.trim()}" creado en Pipeline`);
        } catch (e) {
            alert('Error al convertir el correo en proyecto: ' + e.message);
        }
    };

    function renderBusinessMail() {
        const body = document.getElementById('business-mail-body');
        const totalEl = document.getElementById('business-mail-count');
        const unreadEl = document.getElementById('business-mail-unread');
        const labeledEl = document.getElementById('business-mail-labeled');
        if (totalEl) totalEl.textContent = String(state.businessNotifications.length);
        if (unreadEl) unreadEl.textContent = String(state.businessNotifications.filter((item) => !item.is_read).length);
        if (labeledEl) labeledEl.textContent = String(state.businessNotifications.filter((item) => (item.label || '').toLowerCase() === 'negocios').length);

        if (!body) return;
        body.innerHTML = '';
        if (!state.businessNotifications.length) {
            body.innerHTML = '<tr><td colspan="6" class="text-muted">Todavía no han llegado correos de negocio.</td></tr>';
            return;
        }

        state.businessNotifications.forEach((mail) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.innerHTML = `
                <td>${mail.received_at ? new Date(mail.received_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '--'}</td>
                <td>
                    <div class="d-flex flex-column">
                        <strong>${escapeHtml(mail.from_name || mail.from_email || '--')}</strong>
                        <small class="text-muted">${escapeHtml(mail.from_email || '')}</small>
                    </div>
                </td>
                <td>
                    <div class="d-flex flex-column">
                        <strong>${escapeHtml(mail.subject || '--')}</strong>
                        <small class="text-muted text-truncate" style="max-width: 340px;">${escapeHtml(mail.snippet || '')}</small>
                    </div>
                </td>
                <td><span class="badge rounded-pill ${mail.label === 'negocios' ? 'bg-success' : 'bg-secondary'}">${escapeHtml(mail.label || '--')}</span></td>
                <td><span class="badge rounded-pill ${mail.is_read ? 'bg-secondary' : 'bg-warning text-dark'}">${mail.is_read ? 'Leído' : 'Nuevo'}</span></td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-2" data-action="view">Ver</button>
                    <button class="btn btn-sm btn-outline-success me-2" data-action="toggle">${mail.is_read ? 'No leído' : 'Leído'}</button>
                    <button class="btn btn-sm" style="background-color: var(--sidebar-active); color:#fff; border:none;" data-action="convert">${convertedProjectId(mail) ? 'Ver proyecto' : '+ Proyecto'}</button>
                </td>`;
            tr.addEventListener('click', async (event) => {
                const target = event.target;
                if (target && target.closest('[data-action]')) return;
                openBusinessMailModal(mail);
            });
            tr.querySelector('[data-action="view"]').addEventListener('click', () => openBusinessMailModal(mail));
            tr.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
                try {
                    await api.updateBusinessNotification(mail.id, { is_read: !mail.is_read });
                    await refreshBusinessMailState();
                    renderBusinessMail();
                } catch (err) {
                    alert('Error al actualizar correo: ' + err.message);
                }
            });
            tr.querySelector('[data-action="convert"]').addEventListener('click', () => window.convertMailToProject(mail.id));
            body.appendChild(tr);
        });
    }

    function openBusinessMailModal(mail) {
        if (!businessMailModal || !mail) return;
        currentBusinessMailId = String(mail.id || '');
        document.getElementById('business-mail-id-input').value = currentBusinessMailId;
        document.getElementById('business-mail-subject').value = mail.subject || '';
        document.getElementById('business-mail-label').value = mail.label || '';
        document.getElementById('business-mail-from').value = mail.from_name && mail.from_email
            ? `${mail.from_name} <${mail.from_email}>`
            : (mail.from_name || mail.from_email || '');
        document.getElementById('business-mail-date').value = mail.received_at ? new Date(mail.received_at).toLocaleString('es-ES') : '';
        document.getElementById('business-mail-snippet').value = mail.snippet || '';
        document.getElementById('business-mail-body-text').value = mail.body || '';
        document.getElementById('business-mail-url').value = mail.url || '';
        document.getElementById('business-mail-toggle-read-btn').textContent = mail.is_read ? 'Marcar no leído' : 'Marcar leído';
        document.getElementById('business-mail-convert-btn').textContent = convertedProjectId(mail) ? 'Ver proyecto' : 'Convertir en proyecto';
        businessMailModal.show();
    }

    window.refreshBusinessMail = async function refreshBusinessMail() {
        await refreshBusinessMailState();
        renderBusinessMail();
    };

    window.openBusinessMailModal = openBusinessMailModal;

    document.getElementById('business-mail-convert-btn').addEventListener('click', () => {
        if (currentBusinessMailId) window.convertMailToProject(currentBusinessMailId);
    });

    document.getElementById('business-mail-toggle-read-btn').addEventListener('click', async () => {
        if (!currentBusinessMailId) return;
        const mail = state.businessNotifications.find((item) => String(item.id) === String(currentBusinessMailId));
        const nextValue = !(mail && mail.is_read);
        try {
            await api.updateBusinessNotification(currentBusinessMailId, { is_read: nextValue });
            await refreshBusinessMailState();
            renderBusinessMail();
            openBusinessMailModal(state.businessNotifications.find((item) => String(item.id) === String(currentBusinessMailId)));
            showToast(nextValue ? 'Marcado como leído' : 'Marcado como no leído');
        } catch (err) {
            alert('Error actualizando correo: ' + err.message);
        }
    });

    // ---- TEMA ----
    const savedTheme=localStorage.getItem('theme')||'light';
    document.body.dataset.theme=savedTheme;

    function syncThemeButtons() {
        const lightBtn = document.getElementById('theme-choice-light');
        const darkBtn = document.getElementById('theme-choice-dark');
        if (!lightBtn || !darkBtn) return;
        const isDark = document.body.dataset.theme === 'dark';
        lightBtn.classList.toggle('active', !isDark);
        darkBtn.classList.toggle('active', isDark);
    }

    window.setTheme = function(theme) {
        document.body.dataset.theme = theme === 'dark' ? 'dark' : 'light';
        localStorage.setItem('theme', document.body.dataset.theme);
        updateChartsTheme();
        syncThemeButtons();
    };
    window.toggleTheme=function(){
        window.setTheme(document.body.dataset.theme==='dark'?'light':'dark');
    };
    syncThemeButtons();
    document.getElementById('theme-choice-light')?.addEventListener('click', () => window.setTheme('light'));
    document.getElementById('theme-choice-dark')?.addEventListener('click', () => window.setTheme('dark'));

    // ---- PERFIL ----
    // Antes: un avatar con el nombre "Admin" hardcodeado (imagen de un
    // servicio externo) y ningún botón real detrás. Ahora muestra tus
    // iniciales y abre un perfil con datos reales de tu sesión de Supabase.
    function userInitials(email) {
        const local = String(email || '').split('@')[0] || '?';
        return local.slice(0, 2).toUpperCase();
    }

    function formatProfileDate(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
        } catch {
            return '—';
        }
    }

    function renderProfile() {
        const user = window.__GESTOR_USER || {};
        const ini = userInitials(user.email);
        const headerAvatar = document.getElementById('header-avatar');
        const profileAvatar = document.getElementById('profile-avatar');
        if (headerAvatar) headerAvatar.textContent = ini;
        if (profileAvatar) profileAvatar.textContent = ini;
        const profileEmail = document.getElementById('profile-email');
        if (profileEmail) profileEmail.textContent = user.email || '—';
        const createdEl = document.getElementById('profile-created-at');
        if (createdEl) createdEl.textContent = formatProfileDate(user.created_at);
        const lastSignInEl = document.getElementById('profile-last-sign-in');
        if (lastSignInEl) lastSignInEl.textContent = formatProfileDate(user.last_sign_in_at);
        const verifiedEl = document.getElementById('profile-email-verified');
        if (verifiedEl) verifiedEl.textContent = user.email_confirmed_at ? 'Sí' : 'No';
        syncThemeButtons();
    }
    renderProfile();
    document.getElementById('profileModal')?.addEventListener('show.bs.modal', renderProfile);
    document.getElementById('profile-logout-btn')?.addEventListener('click', () => {
        document.getElementById('sidebar-logout-btn')?.click();
    });

    // ---- NAVEGACIÓN ----
    navLinks.dashboard.addEventListener('click',()=>{ showView('dashboard','Performance Overview','Resumen de datos'); renderDashboard(); });
    navLinks.projects.addEventListener('click',()=>{ showView('projects','Proyectos','Tus carpetas de trabajo'); renderProjectsList(); });
    navLinks.board.addEventListener('click',()=>{ showView('board','Mis Tareas','Todas tus tareas, de todos tus proyectos'); renderGlobalBoard(); });
    navLinks.calendar.addEventListener('click',()=>{ showView('calendar','Calendario','Vista de tareas por fecha'); renderCalendar(); });
    navLinks.finances.addEventListener('click',()=>{ showView('finances','Finanzas','Control de ingresos y gastos'); renderFinances(); });
    navLinks.activity.addEventListener('click',()=>{ showView('activity','Actividad','Registro de actividades recientes'); renderActivityFeed(); });
    navLinks.pipeline.addEventListener('click',()=>{ showView('pipeline','Pipeline','Flujo de proyectos'); renderPipeline(); });
    navLinks.notes.addEventListener('click',()=>{ showView('notes','Notas','Tus notas y apuntes'); renderNoteFolderTabs(); renderNotesList(); });
    document.getElementById('notes-search-input')?.addEventListener('input', renderNotesList);
    navLinks.businessMail.addEventListener('click',()=>{ showView('businessMail','Correo Negocio','Solo mensajes filtrados por n8n y Gmail'); renderBusinessMail(); });
    navLinks.integrations.addEventListener('click',()=>{ showView('integrations','Integraciones','Conecta el CRM con otras herramientas'); renderIntegrations(); });

    // ---- INICIO ----
    showView('dashboard','Performance Overview','Resumen de datos');
    renderDashboard();
    document.getElementById('app-loading-overlay')?.setAttribute('hidden', '');
    await refreshBusinessMailState();
    await refreshIntegrationsState();
}

if (window.__GESTOR_AUTH_READY && window.__GESTOR_ACCESS_TOKEN) {
    window.startGestorApp().catch((error) => {
        console.error('Error iniciando la app:', error);
        // No dejar el overlay de carga trabado si algo falla arrancando la app.
        document.getElementById('app-loading-overlay')?.setAttribute('hidden', '');
    });
}
