COMMENT ON FUNCTION public.rpc_group_invite_user(uuid, uuid)
IS 'LEGACY/DEPRECATED: superseded by rpc_group_add_member(uuid, uuid, text), which enforces saved/contact/shared-group relationship scope and target join preferences. Do not use for new group-add flows. Kept only for backward compatibility with older database/API clients.';
