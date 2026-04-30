begin;

drop policy if exists "match_participants_select_pending_nominated" on public.match_participants;

create policy "match_participants_select_pending_nominated"
on public.match_participants
for select
to authenticated
using (
  status = 'pending'::public.match_participant_status
  and user_id is not null
  and join_method = 'nominated'::public.match_join_method
  and participant_accepted_at is null
  and removed_at is null
  and (
    public.is_caller_in_match_scope(match_id)
    or public.is_caller_match_associated(match_id)
  )
  and (
    nominated_by = auth.uid()
    or public.sharegroup_exists(auth.uid(), user_id)
  )
);

commit;
