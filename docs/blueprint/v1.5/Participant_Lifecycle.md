# Participant Lifecycle v1.5

                     ┌───────────────┐
                     │   Invited     │
                     │ join_method   │
                     │ = invited     │
                     └──────┬────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ Participant       │
                   │ Accepted          │
                   │ (participant_     │
                   │ accepted_at set)  │
                   └──────┬────────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │ Organizer Approved  │
                │ (org_approved_at)   │
                └──────┬──────────────┘
                       │
                       ▼
                ┌─────────────────────┐
                │ Confirmed           │
                │ confirmed_at set    │
                └──────┬──────────────┘
                       │
           ┌───────────┴────────────┐
           ▼                        ▼
     ┌──────────────┐        ┌────────────────┐
     │ Removed      │        │ Match Updated  │
     │ removed_at   │        │ Reset Confirm  │
     └──────────────┘        └────────────────┘
## State Definitions
1. Pending

participant_accepted_at = NULL
org_approved_at = NULL

2. Accepted (Participant side)

participant_accepted_at NOT NULL
org_approved_at NULL

3. Approved (Organizer side)

org_approved_at NOT NULL
participant_accepted_at NULL

4. Confirmed

Both accepted + approved

5. Removed

removed_at NOT NULL

6. Reconfirm Required

Triggered when match changes:

participant_accepted_at cleared
confirmed_at cleared

## 完整状态枚举
State	Condition
invited_pending	join_method=invited & no accept
requested_pending	join_method=requested
nominated_pending	join_method=nominated
accepted_only	participant_accepted_at not null
approved_only	org_approved_at not null
confirmed	both not null
removed	removed_at not null
reconfirm_required	after match update