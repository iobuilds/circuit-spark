-- Fix function search_path
create or replace function public.touch_custom_components_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Restrict listing to known prefixes (still allows reading individual files via public URL)
drop policy if exists "Public read component-packs" on storage.objects;
create policy "Public read component-packs"
  on storage.objects for select
  using (bucket_id = 'component-packs' and (storage.foldername(name))[1] = 'packs');