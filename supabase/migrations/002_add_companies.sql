-- Migración: módulo de Empresas.
-- Agrega una tabla "companies" (clientes/empresas activas, proyección de
-- ingresos y un log de actividad propio) y vincula los proyectos existentes
-- a una empresa opcional. Aplicar manualmente en el SQL Editor de Supabase
-- (igual que 001_enable_rls.sql) sobre un proyecto que ya tenía las tablas
-- creadas antes de este cambio.

create table if not exists public.companies (
    id text primary key,
    name text not null,
    status text not null default 'active' check (status in ('active', 'inactive')),
    projected_amount numeric not null default 0,
    projected_notes text default '',
    activity_log text not null default '[]',
    created_at text not null
);

alter table public.projects
    add column if not exists company_id text references public.companies(id) on delete set null;

create index if not exists companies_status_idx on public.companies (status);
create index if not exists projects_company_id_idx on public.projects (company_id);

grant select, insert, update, delete on public.companies to authenticated;
alter table public.companies enable row level security;
create policy "authenticated_full_access" on public.companies for all to authenticated using (true) with check (true);
