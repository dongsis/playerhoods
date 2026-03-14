SELECT * 
FROM public.notifications 
WHERE recipient_user_id = <delegator_id>
ORDER BY created_at DESC;