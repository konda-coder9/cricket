-- Cricket scorer shared bundle table.
-- Run this in Supabase SQL Editor.

create table if not exists public.cricket_match_bundles (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.cricket_match_bundles enable row level security;

drop policy if exists "cricket bundle read/write anon" on public.cricket_match_bundles;
create policy "cricket bundle read/write anon"
on public.cricket_match_bundles
for all
to anon, authenticated
using (true)
with check (true);
