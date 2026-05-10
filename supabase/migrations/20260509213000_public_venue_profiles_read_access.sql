-- Public canonical venue pages need anonymous read access to venue metadata
-- and court details. User/member discovery stays behind authenticated RPCs.

drop policy if exists "venues_select_public" on public.venues;
create policy "venues_select_public"
  on public.venues
  for select
  to anon
  using (true);

drop policy if exists "courts_select_public" on public.courts;
create policy "courts_select_public"
  on public.courts
  for select
  to anon
  using (true);
