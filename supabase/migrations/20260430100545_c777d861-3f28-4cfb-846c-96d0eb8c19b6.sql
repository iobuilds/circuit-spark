-- Custom components / boards table
create table public.custom_components (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null check (kind in ('component','board')),
  description text default '',
  svg text not null default '',
  spec jsonb not null default '{}'::jsonb,
  behavior text default '',
  thumbnail_url text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_components_kind_idx on public.custom_components(kind);
create index custom_components_updated_idx on public.custom_components(updated_at desc);

alter table public.custom_components enable row level security;

create policy "Anyone can view custom components"
  on public.custom_components for select using (true);

create policy "Anyone can insert custom components"
  on public.custom_components for insert with check (true);

create policy "Anyone can update custom components"
  on public.custom_components for update using (true) with check (true);

create policy "Anyone can delete custom components"
  on public.custom_components for delete using (true);

-- updated_at trigger
create or replace function public.touch_custom_components_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger custom_components_touch
before update on public.custom_components
for each row execute function public.touch_custom_components_updated_at();

-- Storage bucket for ZIP packs (public)
insert into storage.buckets (id, name, public)
values ('component-packs', 'component-packs', true)
on conflict (id) do nothing;

create policy "Public read component-packs"
  on storage.objects for select
  using (bucket_id = 'component-packs');

create policy "Public write component-packs"
  on storage.objects for insert
  with check (bucket_id = 'component-packs');

create policy "Public update component-packs"
  on storage.objects for update
  using (bucket_id = 'component-packs')
  with check (bucket_id = 'component-packs');

create policy "Public delete component-packs"
  on storage.objects for delete
  using (bucket_id = 'component-packs');