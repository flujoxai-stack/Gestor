-- SEC-02: Activar Row Level Security y quitar el acceso directo de "anon".
--
-- Hoy cualquiera con la anon key puede leer/escribir/borrar TODAS las filas
-- de TODAS las tablas directamente contra la API REST de Supabase, sin pasar
-- por el backend ni por el login. Esta migración:
--   1. Activa RLS en cada tabla.
--   2. Quita los permisos de "anon" (el backend usa la service role key,
--      que siempre ignora RLS, así que no pierde acceso).
--   3. Deja a "authenticated" con permisos, pero protegidos por políticas
--      que exigen que sea una sesión de Supabase Auth válida (ya filtrada
--      por AUTH_ALLOWED_EMAILS en server.js).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → pegar y correr.
-- Requiere: que server.js use SUPABASE_SERVICE_ROLE_KEY (no la anon key).
--           Revisa tu .env / variables de entorno en Vercel.

begin;

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.finances enable row level security;
alter table public.activities enable row level security;
alter table public.notes enable row level security;
alter table public.note_folders enable row level security;
alter table public.settings enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_events enable row level security;
alter table public.business_notifications enable row level security;

-- Quitar el acceso directo del rol anon: el navegador nunca debe poder
-- hablar con Supabase sin pasar por el backend.
revoke all on
    public.projects,
    public.tasks,
    public.finances,
    public.activities,
    public.notes,
    public.note_folders,
    public.settings,
    public.integrations,
    public.integration_events,
    public.business_notifications
from anon;

-- El backend (server.js) debe llamar a Supabase con la service role key,
-- que ignora RLS por diseño. Estas políticas son la red de seguridad para
-- "authenticated": solo se activan si en algún momento el frontend o una
-- integración externa terminan usando un JWT de usuario en vez de la
-- service role key.
create policy "authenticated_full_access" on public.projects
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.tasks
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.finances
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.activities
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.notes
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.note_folders
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.settings
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.integrations
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.integration_events
    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on public.business_notifications
    for all to authenticated using (true) with check (true);

commit;

-- Verificación rápida después de correr esto:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Todas deben mostrar rowsecurity = true.
