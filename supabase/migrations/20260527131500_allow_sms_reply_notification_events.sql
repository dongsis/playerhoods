alter table public.match_participant_notification_events
  drop constraint if exists match_participant_notification_events_type_check;

alter table public.match_participant_notification_events
  add constraint match_participant_notification_events_type_check
  check (
    notification_type in (
      'invite',
      'confirmed_lineup',
      'critical_update',
      'cancellation',
      'add_request',
      'host_managed_confirmation',
      'match_reminder',
      'sms_reply_confirmation',
      'sms_reply_help',
      'sms_reply_disambiguation'
    )
  );
