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
    globalTimeSpent: 0
};

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
                <div style="width:32px;height:32px;border-radius:50%;background:var(--main-bg);display:flex;align-items:center;justify-content:center;color:var(--sidebar-active);font-size:1rem;flex-shrink:0;">📋</div>
                <div style="display:flex;flex-direction:column;justify-content:center;">
                    <div style="font-size:0.85rem;font-weight:600;">${a.title}</div>
                    <small style="font-size:0.7rem;color:var(--text-muted);">${a.desc || ''}</small>
                </div>
            </div>
            <div class="item-right" style="font-size:0.75rem;color:var(--text-muted);text-align:right;">${dateStr}</div>`;
        feed.appendChild(div);
    });
    if (state.activities.length === 0) {
        feed.innerHTML = '<p class="text-muted small mt-2">No hay actividad reciente.</p>';
    }
}

let currentDbTab = 'projects';

function updateDbTabButtons() {
    const tabs = ['projects', 'finances', 'activities'];
    tabs.forEach((tab) => {
        const btn = document.getElementById(`db-tab-${tab}`);
        if (!btn) return;
        btn.classList.toggle('active', tab === currentDbTab);
    });
}

window.switchDbTab = function switchDbTab(tab) {
    currentDbTab = tab || 'projects';
    updateDbTabButtons();
    if (typeof window.renderDatabase === 'function') {
        window.renderDatabase();
    }
};

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
        toast.innerHTML = `<svg width="20" height="20" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> <span>${msg}</span>`;
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
        warranty:  document.getElementById('warranty-view'),
        board:     document.getElementById('board-view'),
        calendar:  document.getElementById('calendar-view'),
        finances:  document.getElementById('finances-view'),
        activity:  document.getElementById('activity-view'),
        pipeline:  document.getElementById('pipeline-view'),
        reports:   document.getElementById('reports-view'),
        database:  document.getElementById('database-view'),
        notes:     document.getElementById('notes-view')
    };
    const navLinks = {
        dashboard: document.getElementById('nav-dashboard'),
        projects:  document.getElementById('nav-projects'),
        warranty:  document.getElementById('nav-warranty'),
        board:     document.getElementById('nav-tasks'),
        calendar:  document.getElementById('nav-calendar'),
        finances:  document.getElementById('nav-finances'),
        activity:  document.getElementById('nav-activity'),
        pipeline:  document.getElementById('nav-pipeline'),
        reports:   document.getElementById('nav-reports'),
        database:  document.getElementById('nav-database'),
        notes:     document.getElementById('nav-notes')
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
    let barChart, pieChart, areaChart, radarChart, polarChart;
    let reportsPipelineChart, reportsProfitChart;
    Chart.defaults.font.family = "'Outfit', sans-serif";

    function renderDashboard() {
        let tTotal=0, tDone=0, tPend=0, tRev=0, tTodo=0;
        let projNames=[], projDone=[], projPend=[], projTotal=[];
        let upcoming=[];
        let prioAlta=0, prioMedia=0, prioBaja=0;
        let futureDates=[], futureLabels=[];
        for(let i=0;i<7;i++){
            let d=new Date(); d.setDate(d.getDate()+i);
            futureDates.push(d.toISOString().split('T')[0]);
            futureLabels.push(new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric'}).format(d));
        }
        let futureCounts=futureDates.map(()=>0);

        state.projects.forEach(p=>{
            let d=0,pd=0,pt=0;
            p.tasks.forEach(t=>{
                tTotal++;pt++;
                if(t.status==='done'){tDone++;d++;}
                else{
                    tPend++;pd++;
                    if(t.status==='inprogress')tRev++;
                    if(t.status==='todo')tTodo++;
                    if(t.priority==='Alta')prioAlta++;
                    else if(t.priority==='Media')prioMedia++;
                    else prioBaja++;
                    if(t.dueDate){
                        let idx=futureDates.indexOf(t.dueDate);
                        if(idx!==-1)futureCounts[idx]++;
                        upcoming.push({title:t.title,date:t.dueDate,pName:p.name});
                    }
                }
            });
            projNames.push(p.name);projDone.push(d);projPend.push(pd);projTotal.push(pt);
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
            upList.innerHTML+=`<div class="custom-list-item"><div class="item-left"><div style="width:30px;height:30px;border-radius:50%;background:#eceafe;display:flex;align-items:center;justify-content:center;color:#6e48c1;font-size:0.8rem;flex-shrink:0;">📅</div> <div style="display:flex; flex-direction:column; justify-content:center;"><div style="font-size:0.85rem;line-height:1.2;font-weight:600;">${u.title}</div><small style="font-size:0.7rem;color:var(--text-muted);">${u.pName}</small></div></div><div class="item-right" style="font-size:0.8rem;color:var(--text-muted);text-align:right;">${u.date}</div></div>`;
        });
        if(upcoming.length===0)upList.innerHTML='<p class="text-muted small mt-2">No hay tareas pendientes con fecha.</p>';

        const txtColor=document.body.dataset.theme==='dark'?'#fff':'#8b8e99';
        const gridColor=document.body.dataset.theme==='dark'?'#333':'#f1f2f6';

        if(barChart)barChart.destroy();
        let barCtx=document.getElementById('barChart').getContext('2d');
        let gradDone=barCtx.createLinearGradient(0,0,0,400);
        gradDone.addColorStop(0,'#10b981');gradDone.addColorStop(1,'#047857');
        let gradPend=barCtx.createLinearGradient(0,0,0,400);
        gradPend.addColorStop(0,'#8b5cf6');gradPend.addColorStop(1,'#6d28d9');
        barChart=new Chart(document.getElementById('barChart'),{type:'bar',data:{labels:projNames,datasets:[{label:'Completadas',data:projDone,backgroundColor:gradDone,borderRadius:8},{label:'Pendientes',data:projPend,backgroundColor:gradPend,borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false},ticks:{color:txtColor,maxRotation:45,minRotation:45}},y:{grid:{color:gridColor},border:{display:false},ticks:{color:txtColor,stepSize:2}}},plugins:{legend:{display:true,position:'top',labels:{color:txtColor}}}}});

        if(pieChart)pieChart.destroy();
        pieChart=new Chart(document.getElementById('pieChart'),{type:'doughnut',data:{labels:['Completadas','En Revisión','Por Hacer'],datasets:[{data:[tDone,tRev,tTodo],backgroundColor:['#6e48c1','#10b981','#f43f5e'],borderWidth:0,cutout:'75%'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});

        if(areaChart)areaChart.destroy();
        let areaCtx=document.getElementById('areaChart').getContext('2d');
        let gradient=areaCtx.createLinearGradient(0,0,0,250);
        gradient.addColorStop(0,'rgba(110,72,193,0.4)');gradient.addColorStop(1,'rgba(110,72,193,0.0)');
        areaChart=new Chart(document.getElementById('areaChart'),{type:'line',data:{labels:futureLabels,datasets:[{label:'Tareas a vencer',data:futureCounts,borderColor:'#6e48c1',backgroundColor:gradient,fill:true,tension:0.4,pointBackgroundColor:'#fff',pointBorderColor:'#6e48c1',pointBorderWidth:2,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false},ticks:{color:txtColor}},y:{grid:{color:gridColor},border:{display:false},ticks:{color:txtColor,stepSize:1}}},plugins:{legend:{display:false}}}});

        if(radarChart)radarChart.destroy();
        radarChart=new Chart(document.getElementById('radarChart'),{type:'radar',data:{labels:['Alta','Media','Baja'],datasets:[{label:'Prioridades',data:[prioAlta,prioMedia,prioBaja],backgroundColor:'rgba(16,185,129,0.2)',borderColor:'#10b981',pointBackgroundColor:'#10b981',pointBorderColor:'#fff',pointHoverBackgroundColor:'#fff',pointHoverBorderColor:'#10b981'}]},options:{responsive:true,maintainAspectRatio:false,scales:{r:{angleLines:{color:gridColor},grid:{color:gridColor},pointLabels:{color:txtColor,font:{size:13}},ticks:{display:false,stepSize:1}}},plugins:{legend:{display:false}}}});

        if(polarChart)polarChart.destroy();
        polarChart=new Chart(document.getElementById('polarChart'),{type:'polarArea',data:{labels:projNames,datasets:[{data:projTotal,backgroundColor:['rgba(110,72,193,0.6)','rgba(16,185,129,0.6)','rgba(244,63,94,0.6)','rgba(245,158,11,0.6)','rgba(59,130,246,0.6)'],borderWidth:1,borderColor:document.body.dataset.theme==='dark'?'#252528':'#fff'}]},options:{responsive:true,maintainAspectRatio:false,scales:{r:{grid:{color:gridColor},ticks:{display:false}}},plugins:{legend:{position:'right',labels:{color:txtColor}}}}});

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
            document.getElementById('global-timer-btn').style.background='#f43f5e';
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
            document.getElementById('global-timer-btn').style.background='#f43f5e';
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
        const inactiveColor=document.body.dataset.theme==='dark'?'#2a2a2e':'#e2e8f0';
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
                    lines[currentSeg].setAttribute('stroke','#6e48c1');
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
            if(currentProjFilter==='active'&&progress===100&&p.tasks.length>0)return;
            if(currentProjFilter==='done'&&(progress<100||p.tasks.length===0))return;
            let datesHtml='';
            const startDate = p.start_date || p.startDate || '';
            const endDate   = p.end_date   || p.endDate   || '';
            const wStart    = p.warranty_start || p.warrantyStart || '';
            const wEnd      = p.warranty_end   || p.warrantyEnd   || '';
            if(startDate||endDate){
                datesHtml+=`<div style="display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted);background:var(--main-bg);padding:0.3rem 0.5rem;border-radius:6px;"><span><span style="color:var(--text-main);font-weight:500;">Inicio:</span> ${startDate||'--'}</span><span><span style="color:var(--text-main);font-weight:500;">Fin:</span> ${endDate||'--'}</span></div>`;
            }
            if(wStart||wEnd){
                datesHtml+=`<div style="display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted);background:rgba(16,185,129,0.1);padding:0.3rem 0.5rem;border-radius:6px;"><span><span style="color:#10b981;font-weight:500;">Garantía Inc:</span> ${wStart||'--'}</span><span><span style="color:#10b981;font-weight:500;">Garantía Fin:</span> ${wEnd||'--'}</span></div>`;
            }
            const el=document.createElement('div'); el.className='col';
            el.innerHTML=`<div class="project-card" onclick="openProject('${p.id}')"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;"><div style="width:42px;height:42px;border-radius:12px;background:var(--main-bg);color:var(--sidebar-active);display:flex;align-items:center;justify-content:center;"><svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></div><div style="display:flex;align-items:center;gap:8px;"><span class="metric-badge" style="background:var(--main-bg);color:var(--text-muted);font-size:0.75rem;">${progress}%</span><button class="btn-action-icon btn-action-delete" style="padding:4px;" onclick="deleteProject('${p.id}',event)" title="Eliminar Proyecto">🗑️</button></div></div><h5 style="color:var(--text-main);font-weight:600;margin-bottom:0.2rem;">${p.name}</h5><p class="text-muted small m-0">${p.tasks.length} Tareas</p>${datesHtml}<div style="width:100%;background-color:var(--border-color);height:6px;border-radius:4px;margin-top:1rem;overflow:hidden;"><div style="width:${progress}%;background-color:${progress===100?'#10b981':'var(--sidebar-active)'};height:100%;transition:width 0.3s ease;"></div></div></div>`;
            list.appendChild(el);
        });
    }

    window.openProject = function(id) {
        state.currentProjectId = id;
        showView('board','Tareas','Gestión de Kanban');
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
    function renderBoard() {
        const p=state.projects.find(x=>x.id===state.currentProjectId); if(!p)return;
        document.getElementById('view-project-tasks').textContent=`Tareas: ${p.name}`;
        ['todo','inprogress','done','paused'].forEach(s=>{
            document.getElementById(`${s}-list`).innerHTML='';
            document.getElementById(`count-${s}`).textContent='0';
        });
        let counts={todo:0,inprogress:0,done:0,paused:0};
        p.tasks.forEach(t=>{
            counts[t.status]++;
            const card=document.createElement('div'); card.className='task-card'; card.dataset.id=t.id;
            const dateHtml=t.dueDate?`<div style="margin-bottom:4px;">📅 ${t.dueDate}</div>`:'';
            card.innerHTML=`<div class="task-title">${t.title}</div><div class="task-footer"><div class="task-meta">${dateHtml}<span class="priority-badge priority-${t.priority}">${t.priority}</span></div><div class="d-flex"><button class="btn-action-icon btn-action-delete" onclick="deleteTaskDirectly('${t.id}',event)" title="Eliminar">🗑️</button><button class="btn-action-icon" onclick="editTask('${t.id}',event)" title="Editar">✏️</button></div></div>`;
            document.getElementById(`${t.status}-list`).appendChild(card);
        });
        Object.keys(counts).forEach(k=>document.getElementById(`count-${k}`).textContent=counts[k]);
    }

    // Drag & Drop Kanban
    ['todo','inprogress','done','paused'].forEach(s=>{
        new Sortable(document.getElementById(`${s}-list`),{
            group:'kanban', animation:150,
            onEnd: async (evt)=>{
                const tId=evt.item.dataset.id;
                const nStat=evt.to.id.replace('-list','');
                const p=state.projects.find(x=>x.id===state.currentProjectId);
                const t=p&&p.tasks.find(x=>x.id===tId);
                if(t&&t.status!==nStat){
                    t.status=nStat;
                    try {
                        await api.updateTask(tId, { ...t, due_date: t.dueDate });
                        renderBoard();
                    } catch(e){ console.error('Error actualizando tarea:', e); }
                }
            }
        });
    });

    // FAB — Nueva Tarea
    document.getElementById('fab-add-task').addEventListener('click', ()=>{
        document.getElementById('task-id-input').value='';
        document.getElementById('task-title-input').value='';
        document.getElementById('task-description-input').value='';
        document.getElementById('task-priority-input').value='Media';
        document.getElementById('task-due-date-input').value='';
        document.getElementById('task-status-input').value='todo';
        const modal=new bootstrap.Modal(document.getElementById('taskDetailModal'));
        modal.show();
    });

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
        const p=state.projects.find(x=>x.id===state.currentProjectId);
        if(!p)return;
        try {
            if(id){
                // Actualizar
                await api.updateTask(id, taskData);
                const t=p.tasks.find(x=>x.id===id);
                if(t){ Object.assign(t, taskData); }
                if(window.logActivity)window.logActivity('Tarea Actualizada', taskData.title);
            } else {
                // Crear
                const newTask=await api.createTask(p.id, taskData);
                p.tasks.push(newTask);
                if(window.logActivity)window.logActivity('Tarea Creada', taskData.title);
            }
            bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide();
            renderBoard();
            if(navLinks.dashboard.classList.contains('active'))renderDashboard();
        } catch(e){ alert('Error al guardar tarea: '+e.message); }
    });

    // Eliminar tarea desde modal
    document.getElementById('delete-task-btn').addEventListener('click', async ()=>{
        const id=document.getElementById('task-id-input').value;
        if(!id)return;
        if(confirm('¿Eliminar esta tarea?')){
            const p=state.projects.find(x=>x.id===state.currentProjectId);
            try {
                await api.deleteTask(id);
                if(p) p.tasks=p.tasks.filter(t=>t.id!==id);
                bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide();
                renderBoard();
            } catch(e){ alert('Error al eliminar tarea: '+e.message); }
        }
    });

    window.editTask = function(id, event) {
        if(event)event.stopPropagation();
        const p=state.projects.find(x=>x.id===state.currentProjectId);
        const t=p&&p.tasks.find(x=>x.id===id);
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
            const p=state.projects.find(x=>x.id===state.currentProjectId);
            try {
                await api.deleteTask(id);
                if(p)p.tasks=p.tasks.filter(t=>t.id!==id);
                renderBoard();
                if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            } catch(e){ alert('Error al eliminar tarea: '+e.message); }
        }
    };

    // ---- CALENDARIO ----
    let calendar;
    function renderCalendar() {
        const calEl=document.getElementById('calendar-container'); let events=[];
        const colorPalette=['#ec4899','#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316'];
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
            events, height:650,
            eventClick:function(info){ state.currentProjectId=info.event.extendedProps.projId; window.editTask(info.event.id,new Event('click')); }
        });
        setTimeout(()=>{calendar.render();},150);
    }

    // ---- GARANTÍAS ----
    window.renderWarrantyList = function() {
        const list=document.getElementById('warranty-list'); list.innerHTML='';
        state.projects.forEach(p=>{
            const wStart=p.warranty_start||p.warrantyStart||'--';
            const wEnd=p.warranty_end||p.warrantyEnd||'--';
            const hasWarranty=(p.warranty_start||p.warrantyStart||p.warranty_end||p.warrantyEnd);
            const el=document.createElement('div'); el.className='col';
            el.innerHTML=`<div class="project-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;"><h5 style="color:var(--text-main);font-weight:600;margin:0;">${p.name}</h5><button class="btn btn-sm btn-outline-primary" style="border-radius:20px;font-size:0.75rem;border-color:var(--sidebar-active);color:var(--sidebar-active);" onclick="openEditWarranty('${p.id}')">Asignar</button></div><div style="display:flex;justify-content:space-between;margin-top:1rem;font-size:0.85rem;color:var(--text-muted);background:${hasWarranty?'rgba(16,185,129,0.1)':'var(--main-bg)'};padding:0.8rem;border-radius:8px;"><div style="display:flex;flex-direction:column;"><span style="font-weight:600;color:${hasWarranty?'#10b981':'var(--text-main)'};">Inicio</span><span>${wStart}</span></div><div style="display:flex;flex-direction:column;"><span style="font-weight:600;color:${hasWarranty?'#10b981':'var(--text-main)'};">Fin</span><span>${wEnd}</span></div></div></div>`;
            list.appendChild(el);
        });
    };

    const editWarrantyModal=new bootstrap.Modal(document.getElementById('editWarrantyModal'));
    window.openEditWarranty=function(id){
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
                window.renderWarrantyList();
            } catch(e){ alert('Error actualizando garantía: '+e.message); }
        }
    });

    // ---- FINANZAS ----
    function renderFinances() {
        const tbody =
            document.getElementById('finance-table-body') ||
            document.getElementById('finances-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let inc=0,exp=0;
        state.finances.forEach(f=>{
            if(f.type==='income')inc+=parseFloat(f.amount);else exp+=parseFloat(f.amount);
            const tr=document.createElement('tr');
            tr.innerHTML=`<td>${f.concept}</td><td><span class="metric-badge" style="background:${f.type==='income'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)'};color:${f.type==='income'?'#10b981':'#f43f5e'}">${f.type==='income'?'Ingreso':'Gasto'}</span></td><td style="color:${f.type==='income'?'#10b981':'#f43f5e'};font-weight:600;">${f.type==='income'?'+':'-'}$${parseFloat(f.amount).toFixed(2)}</td><td>${f.date}</td><td><button class="btn-action-icon btn-action-delete" onclick="deleteFinance('${f.id}')">🗑️</button></td>`;
            tbody.appendChild(tr);
        });
        const incomeEl = document.getElementById('fin-income') || document.getElementById('fin-inc');
        const expenseEl = document.getElementById('fin-expense') || document.getElementById('fin-exp');
        const balanceEl = document.getElementById('fin-balance') || document.getElementById('fin-bal');
        if (incomeEl) incomeEl.textContent = `$${inc.toFixed(2)}`;
        if (expenseEl) expenseEl.textContent = `$${exp.toFixed(2)}`;
        if (balanceEl) balanceEl.textContent = `$${(inc-exp).toFixed(2)}`;
    }

    const addFinanceModal=new bootstrap.Modal(document.getElementById('addFinanceModal'));
    document.getElementById('add-finance-btn').addEventListener('click', async ()=>{
        const concept=document.getElementById('fin-concept-input').value.trim();
        const type=document.getElementById('fin-type-input').value;
        const amount=parseFloat(document.getElementById('fin-amount-input').value);
        const date=document.getElementById('fin-date-input').value;
        if(!concept||!amount||!date)return;
        try {
            const newFin=await api.createFinance({concept,type,amount,date});
            state.finances.unshift(newFin);
            if(window.logActivity)window.logActivity('Movimiento Registrado', `${concept} - $${amount}`);
            addFinanceModal.hide();
            document.getElementById('fin-concept-input').value='';
            document.getElementById('fin-amount-input').value='';
            document.getElementById('fin-date-input').value='';
            renderFinances();
            if(navLinks.dashboard.classList.contains('active'))renderDashboard();
        } catch(e){ alert('Error al guardar movimiento: '+e.message); }
    });

    window.deleteFinance=async function(id){
        if(confirm('¿Eliminar este movimiento?')){
            try {
                await api.deleteFinance(id);
                state.finances=state.finances.filter(f=>f.id!==id);
                renderFinances();
                if(navLinks.dashboard.classList.contains('active'))renderDashboard();
            } catch(e){ alert('Error al eliminar: '+e.message); }
        }
    };

    // ---- PIPELINE ----
    function renderPipeline() {
        const stages=['lead','negotiation','execution','delivered'];
        stages.forEach(s=>{
            const col=document.getElementById(`pipeline-${s}`); if(!col)return; col.innerHTML='';
            state.projects.filter(p=>p.status===s).forEach(p=>{
                const d=document.createElement('div'); d.className='task-card mb-2';
                d.innerHTML=`<div class="task-title">${p.name}</div><div class="task-footer"><div class="task-meta"><small style="color:var(--text-muted);">${p.tasks.length} tareas</small></div></div>`;
                col.appendChild(d);
            });
        });
    }

    // ---- REPORTES ----
    function renderReports() {
        let lead=0, negotiation=0, execution=0, delivered=0;
        state.projects.forEach((p) => {
            if (p.status === 'lead') lead++;
            else if (p.status === 'negotiation') negotiation++;
            else if (p.status === 'execution') execution++;
            else if (p.status === 'delivered') delivered++;
        });

        let inc=0,exp=0;
        state.finances.forEach(f=>{if(f.type==='income')inc+=parseFloat(f.amount);else exp+=parseFloat(f.amount);});

        const reportPipelineCanvas = document.getElementById('reportsPipelineChart');
        const reportProfitCanvas = document.getElementById('reportsProfitChart');
        if (!reportPipelineCanvas || !reportProfitCanvas) return;

        const txtColor=document.body.dataset.theme==='dark'?'#fff':'#8b8e99';
        const gridColor=document.body.dataset.theme==='dark'?'#333':'#f1f2f6';

        if (reportsPipelineChart) reportsPipelineChart.destroy();
        reportsPipelineChart = new Chart(reportPipelineCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Prospecto', 'Negociación', 'Ejecución', 'Entregado'],
                datasets: [{
                    data: [lead, negotiation, execution, delivered],
                    backgroundColor: ['#2dd4bf', '#60a5fa', '#f59e0b', '#10b981'],
                    borderWidth: 0,
                    cutout: '72%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: txtColor }
                    }
                }
            }
        });

        if (reportsProfitChart) reportsProfitChart.destroy();
        reportsProfitChart = new Chart(reportProfitCanvas, {
            type: 'bar',
            data: {
                labels: ['Ingresos', 'Gastos', 'Balance'],
                datasets: [{
                    label: 'Monto',
                    data: [inc, exp, inc - exp],
                    backgroundColor: ['#10b981', '#f43f5e', '#6e48c1'],
                    borderRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: txtColor } },
                    y: { grid: { color: gridColor }, ticks: { color: txtColor } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    // ---- BASE DE DATOS (vista tabla) ----
    function renderDatabase() {
        const thead = document.getElementById('db-thead');
        const tbody = document.getElementById('db-tbody');
        if (!thead || !tbody) return;

        tbody.innerHTML = '';
        updateDbTabButtons();

        if (currentDbTab === 'projects') {
            thead.innerHTML = `
                <tr>
                    <th>Proyecto</th>
                    <th>Tarea</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Vence</th>
                </tr>`;
            state.projects.forEach(p => {
                p.tasks.forEach(t => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${p.name}</td>
                        <td>${t.title}</td>
                        <td><span class="metric-badge">${t.status}</span></td>
                        <td><span class="priority-badge priority-${t.priority}">${t.priority}</span></td>
                        <td>${t.dueDate || '--'}</td>`;
                    tbody.appendChild(tr);
                });
            });
            if (!tbody.children.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No hay proyectos o tareas para mostrar.</td></tr>';
            }
            return;
        }

        if (currentDbTab === 'finances') {
            thead.innerHTML = `
                <tr>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Fecha</th>
                    <th>Proyecto</th>
                </tr>`;
            state.finances.forEach(f => {
                const tr = document.createElement('tr');
                const project = state.projects.find((p) => String(p.id) === String(f.project_id));
                tr.innerHTML = `
                    <td>${f.concept}</td>
                    <td><span class="metric-badge" style="background:${f.type === 'income' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)'};color:${f.type === 'income' ? '#10b981' : '#f43f5e'}">${f.type === 'income' ? 'Ingreso' : 'Gasto'}</span></td>
                    <td style="font-weight:600;color:${f.type === 'income' ? '#10b981' : '#f43f5e'}">${f.type === 'income' ? '+' : '-'}$${parseFloat(f.amount).toFixed(2)}</td>
                    <td>${f.date}</td>
                    <td>${project ? project.name : '--'}</td>`;
                tbody.appendChild(tr);
            });
            if (!tbody.children.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No hay movimientos registrados.</td></tr>';
            }
            return;
        }

        if (currentDbTab === 'activities') {
            thead.innerHTML = `
                <tr>
                    <th>Título</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                </tr>`;
            state.activities.forEach(a => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${a.title}</td>
                    <td>${a.desc || ''}</td>
                    <td>${a.date || '--'}</td>`;
                tbody.appendChild(tr);
            });
            if (!tbody.children.length) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No hay actividad para mostrar.</td></tr>';
            }
        }
    }
    window.renderDatabase = renderDatabase;

// ---- NOTAS ----
let currentNoteFolder = 'General';

const folderPalette = ['#6e48c1', '#0f9bd7', '#10b981', '#f97316', '#ec4899', '#ef4444', '#14b8a6', '#8b5cf6'];

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
        const filtered=state.notes.filter(n=>n.folder===currentNoteFolder);
        filtered.forEach(n=>{
            const div=document.createElement('div');
            div.className = 'note-folder-card';
            div.style.setProperty('--note-accent', n.color || getFolderColor(n.folder) || '#6e48c1');
            div.innerHTML = `
                <div class="note-folder-card-tab"></div>
                <div class="note-folder-card-top">
                    <div class="note-folder-icon" aria-hidden="true">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <path d="M3 9h18"></path>
                        </svg>
                    </div>
                    <button class="btn-action-icon btn-action-delete" onclick="deleteNote('${n.id}',event)">🗑️</button>
                </div>
                <div class="note-folder-card-body">
                    <strong class="note-folder-card-title">${n.title}</strong>
                    <span class="note-folder-card-folder">${n.folder || 'General'}</span>
                </div>
                <div class="note-folder-card-footer">Abrir nota</div>`;
            div.onclick=()=>openEditNote(n);
            list.appendChild(div);
        });
        if(filtered.length===0){
            list.innerHTML='<p class="text-muted small">No hay notas en esta carpeta.</p>';
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
        document.getElementById('note-color-input').value=n.color||getFolderColor(n.folder||'General')||'#6e48c1';
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
            const color = (prompt('Color de la carpeta en hex (#6e48c1):', defaultColor) || defaultColor).trim() || defaultColor;
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

    // ---- COPILOT ----
    window.openCopilotDemo=function(){
        const t=document.getElementById('copilot-tooltip');
        const p=document.getElementById('copilot-text');
        if(t.style.display==='none'||!t.style.display){
            t.style.display='block'; p.innerHTML='';
            const msg=`¡Hola! He detectado ${state.projects.length} proyectos con ${state.projects.reduce((a,p)=>a+p.tasks.length,0)} tareas. ¿Quieres que prepare un reporte?`;
            let i=0;
            const typing=setInterval(()=>{ p.innerHTML+=msg.charAt(i); i++; if(i>=msg.length)clearInterval(typing); },40);
        } else { t.style.display='none'; }
    };

    // ---- TEMA ----
    const savedTheme=localStorage.getItem('theme')||'light';
    document.body.dataset.theme=savedTheme;
    window.toggleTheme=function(){
        const newTheme=document.body.dataset.theme==='dark'?'light':'dark';
        document.body.dataset.theme=newTheme;
        localStorage.setItem('theme',newTheme);
        updateChartsTheme();
    };

    // ---- NAVEGACIÓN ----
    navLinks.dashboard.addEventListener('click',()=>{ showView('dashboard','Performance Overview','Resumen de datos'); renderDashboard(); });
    navLinks.projects.addEventListener('click',()=>{ showView('projects','Proyectos','Tus carpetas de trabajo'); renderProjectsList(); });
    navLinks.warranty.addEventListener('click',()=>{ showView('warranty','Garantías','Gestión de garantías de los proyectos'); window.renderWarrantyList(); });
    navLinks.board.addEventListener('click',()=>{ showView('board','Tareas','Gestión de Kanban'); renderBoard(); });
    navLinks.calendar.addEventListener('click',()=>{ showView('calendar','Calendario','Vista de tareas por fecha'); renderCalendar(); });
    navLinks.finances.addEventListener('click',()=>{ showView('finances','Finanzas','Control de ingresos y gastos'); renderFinances(); });
    navLinks.activity.addEventListener('click',()=>{ showView('activity','Actividad','Registro de actividades recientes'); renderActivityFeed(); });
    navLinks.pipeline.addEventListener('click',()=>{ showView('pipeline','Pipeline','Flujo de proyectos'); renderPipeline(); });
    navLinks.reports.addEventListener('click',()=>{ showView('reports','Reportes','Resumen ejecutivo'); renderReports(); });
    navLinks.database.addEventListener('click',()=>{ showView('database','Base de Datos','Vista de todas las tareas'); renderDatabase(); });
    navLinks.notes.addEventListener('click',()=>{ showView('notes','Notas','Tus notas y apuntes'); renderNoteFolderTabs(); renderNotesList(); });

    // ---- INICIO ----
    showView('dashboard','Performance Overview','Resumen de datos');
    renderDashboard();
}

if (window.__GESTOR_AUTH_READY && window.__GESTOR_ACCESS_TOKEN) {
    window.startGestorApp().catch((error) => {
        console.error('Error iniciando la app:', error);
    });
}
