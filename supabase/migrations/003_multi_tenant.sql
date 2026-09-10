-- Migración: multi-cuenta real (cada usuario autorizado ve solo sus datos).
-- Hasta ahora TODAS las tablas eran compartidas entre cualquier correo que
-- lograra entrar (RLS con "using (true)"): agregar un segundo usuario
-- autorizado significaba que veía y editaba exactamente los mismos datos.
-- Esta migración le agrega una columna owner_id a cada tabla de datos,
-- reasigna todo lo existente al usuario actual (flujoxai@gmail.com) y
-- reescribe las políticas RLS para que cada quien solo vea lo suyo.
--
-- Aplicar manualmente en el SQL Editor de Supabase (igual que 001 y 002).
-- Es seguro volver a correrla (usa IF NOT EXISTS / IF EXISTS en todo).

-- 1) Agregar la columna owner_id (nullable por ahora, se hace NOT NULL al final).
alter table public.companies           add column if not exists owner_id uuid;
alter table public.projects            add column if not exists owner_id uuid;
alter table public.tasks               add column if not exists owner_id uuid;
alter table public.finances            add column if not exists owner_id uuid;
alter table public.activities          add column if not exists owner_id uuid;
alter table public.notes               add column if not exists owner_id uuid;
alter table public.note_folders        add column if not exists owner_id uuid;
alter table public.settings            add column if not exists owner_id uuid;
alter table public.integrations        add column if not exists owner_id uuid;
alter table public.integration_events  add column if not exists owner_id uuid;
alter table public.business_notifications add column if not exists owner_id uuid;

-- 2) Reasignar todo lo que ya existe al usuario original. Si tu cuenta
--    principal no es flujoxai@gmail.com, cambia el correo en esta línea
--    antes de correr la migración.
do $$
declare
  primary_owner uuid;
begin
  select id into primary_owner from auth.users where email = 'flujoxai@gmail.com' limit 1;
  if primary_owner is null then
    raise exception 'No se encontró un usuario con ese correo en auth.users -- ajusta el correo en la migración.';
  end if;

  update public.companies           set owner_id = primary_owner where owner_id is null;
  update public.projects            set owner_id = primary_owner where owner_id is null;
  update public.tasks               set owner_id = primary_owner where owner_id is null;
  update public.finances            set owner_id = primary_owner where owner_id is null;
  update public.activities          set owner_id = primary_owner where owner_id is null;
  update public.notes               set owner_id = primary_owner where owner_id is null;
  update public.note_folders        set owner_id = primary_owner where owner_id is null;
  update public.settings            set owner_id = primary_owner where owner_id is null;
  update public.integrations        set owner_id = primary_owner where owner_id is null;
  update public.integration_events  set owner_id = primary_owner where owner_id is null;
  update public.business_notifications set owner_id = primary_owner where owner_id is null;
end $$;

-- 3) Ajustar restricciones que asumían un solo dueño global.
--    settings: la clave "key" (ej. globalTimeSpent) ahora se repite una
--    vez por usuario, así que la llave primaria pasa a ser (owner_id, key).
alter table public.settings drop constraint if exists settings_pkey;
alter table public.settings add primary key (owner_id, key);

--    note_folders: el nombre de carpeta ("General", "APIs"...) ahora se
--    repite una vez por usuario.
alter table public.note_folders drop constraint if exists note_folders_name_key;
alter table public.note_folders drop constraint if exists note_folders_owner_id_name_key;
alter table public.note_folders add constraint note_folders_owner_id_name_key unique (owner_id, name);

-- 4) Ahora que todo tiene dueño, hacer la columna obligatoria + índice + FK.
alter table public.companies           alter column owner_id set not null;
alter table public.projects            alter column owner_id set not null;
alter table public.tasks               alter column owner_id set not null;
alter table public.finances            alter column owner_id set not null;
alter table public.activities          alter column owner_id set not null;
alter table public.notes               alter column owner_id set not null;
alter table public.note_folders        alter column owner_id set not null;
alter table public.settings            alter column owner_id set not null;
alter table public.integrations        alter column owner_id set not null;
alter table public.integration_events  alter column owner_id set not null;
alter table public.business_notifications alter column owner_id set not null;

create index if not exists companies_owner_id_idx on public.companies (owner_id);
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists tasks_owner_id_idx on public.tasks (owner_id);
create index if not exists finances_owner_id_idx on public.finances (owner_id);
create index if not exists activities_owner_id_idx on public.activities (owner_id);
create index if not exists notes_owner_id_idx on public.notes (owner_id);
create index if not exists note_folders_owner_id_idx on public.note_folders (owner_id);
create index if not exists integrations_owner_id_idx on public.integrations (owner_id);
create index if not exists integration_events_owner_id_idx on public.integration_events (owner_id);
create index if not exists business_notifications_owner_id_idx on public.business_notifications (owner_id);

-- 5) RLS: cada quien ve/edita solo lo suyo. El backend (server.js) usa la
--    service-role key e igual filtra por owner_id en cada consulta -- esto
--    es una segunda capa de protección, no la única.
drop policy if exists "authenticated_full_access" on public.companies;
drop policy if exists "authenticated_full_access" on public.projects;
drop policy if exists "authenticated_full_access" on public.tasks;
drop policy if exists "authenticated_full_access" on public.finances;
drop policy if exists "authenticated_full_access" on public.activities;
drop policy if exists "authenticated_full_access" on public.notes;
drop policy if exists "authenticated_full_access" on public.note_folders;
drop policy if exists "authenticated_full_access" on public.settings;
drop policy if exists "authenticated_full_access" on public.integrations;
drop policy if exists "authenticated_full_access" on public.integration_events;
drop policy if exists "authenticated_full_access" on public.business_notifications;

create policy "owner_full_access" on public.companies for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.projects for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.tasks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.finances for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.activities for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.notes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.note_folders for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.settings for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.integrations for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.integration_events for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_full_access" on public.business_notifications for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 6) Copia este ID: lo necesitas para la variable de entorno
--    N8N_WEBHOOK_OWNER_ID en Vercel (el webhook de n8n no tiene sesión de
--    usuario, así que hay que decirle a mano de quién es ese correo).
select id as tu_owner_id_para_vercel from auth.users where email = 'flujoxai@gmail.com';
