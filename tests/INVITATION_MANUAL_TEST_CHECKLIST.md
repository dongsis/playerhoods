# Invitation Flow Manual Test Checklist

## Prerequisites

- Supabase local or hosted with migrations applied
- `RESEND_API_KEY` set (or use Resend test domain)
- `NEXT_PUBLIC_SITE_URL` or `VERCEL_URL` set for email links

## Case A: Accept flow (unregistered email)

1. [ ] Log in as match organizer
2. [ ] Open a match detail page
3. [ ] In "Invite by Email", enter an email not yet registered (e.g. `test+invite@example.com`)
4. [ ] Click "Invite by email"
5. [ ] Verify success message
6. [ ] Check `notification_deliveries`: one row with `delivery_status = 'sent'` (or `queued` if worker not run)
7. [ ] Check inbox for invitation email
8. [ ] Email subject: "You're invited to a match"
9. [ ] Email has "View Invitation" button (no "Accept Now")
10. [ ] Click "View Invitation"
11. [ ] Land on `/invitations/:id` (not logged in)
12. [ ] Enter the invited email, click "Send sign-in link"
13. [ ] Check inbox for magic link
14. [ ] Click magic link
15. [ ] Redirect to `/invitations/:id` (logged in)
16. [ ] Click "Accept"
17. [ ] Invitation shows "You accepted this invitation"
18. [ ] Match participants: new participant with `join_method = invited`, `participant_accepted_via = email_invitation`
19. [ ] Re-open same invitation URL: shows accepted state, no duplicate participant

## Case B: Decline flow

1. [ ] Create new invitation to another email
2. [ ] Complete magic link auth, land on invitation page
3. [ ] Click "Decline"
4. [ ] Invitation shows "You declined this invitation"
5. [ ] No participant created for this match
6. [ ] Re-open same invitation: shows declined state

## Case C: Wrong email logged in

1. [ ] Log in as user A (e.g. alice@example.com)
2. [ ] Open invitation URL for user B (e.g. bob@example.com)
3. [ ] Page shows: "The email you signed in with doesn't match this invitation"
4. [ ] Accept and Decline buttons not shown
5. [ ] No mutation possible

## Case D: Idempotent accept

1. [ ] Open an already-accepted invitation (same user)
2. [ ] UI shows "You accepted this invitation"
3. [ ] No duplicate participant in match
4. [ ] No duplicate side effects

## Case E: Expired invitation

1. [ ] Create invitation with `expires_at` in the past (via DB or RPC)
2. [ ] Open invitation URL
3. [ ] Shows "This invitation has expired"
4. [ ] Accept blocked (no Accept button when expired)

## Case F: Auth callback redirect

1. [ ] From invitation page (not logged in), request magic link
2. [ ] Use `emailRedirectTo` with `next=/invitations/:id`
3. [ ] Click magic link in email
4. [ ] Land on `/auth/callback?code=...&next=/invitations/:id`
5. [ ] Redirect to `/invitations/:id` with session
6. [ ] Can Accept/Decline

## Notes

- **Supabase Auth**: In Dashboard → Authentication → URL Configuration, add to "Redirect URLs":
  - `http://localhost:3000/auth/callback` (local)
  - `https://yourdomain.com/auth/callback` (production)
- **Resend test mode**: only `beautfly@gmail.com` may receive; verify domain for production
