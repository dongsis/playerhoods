select group_id, user_id, status, invited_by, accepted_at
from public.group_members
where user_id = auth.uid()
order by created_at desc;