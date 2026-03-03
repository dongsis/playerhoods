# Database Facts: Tables

## Table: public.club_admins
**Purpose:** Stores which users are administrators for a club.

**PK:** id

**FKs:**
- club_id (public.clubs.id)
- granted_by (public.profiles.id)
- user_id (public.profiles.id)

**Key columns:**
- club_id ("uuid")
- granted_by ("uuid")
- user_id ("uuid")
- granted_at (timestamp with time zone)

**Constraints:**
- UNIQUE (user_id, club_id)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.club_identities
**Purpose:** Stores external/alternate identifiers for a club (integration/aliasing).

**PK:** id

**FKs:**
- club_id (public.clubs.id)
- user_id (public.profiles.id)

**Key columns:**
- club_id ("uuid")
- created_at (timestamp with time zone)
- user_id ("uuid")

**Constraints:**
- CHECK ((("length"("club_handle") >= 2) AND ("length"("club_handle") <= 30)))
- CHECK (("club_handle" !~~ '%@%'::"text"))
- CHECK (("club_handle" = TRIM(BOTH FROM "club_handle")))
- UNIQUE (club_id, club_handle_norm)
- UNIQUE (club_id, user_id)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.club_sports
**Purpose:** Join table linking clubs to supported sports.

**PK:** club_id, sport_id

**FKs:**
- club_id (public.clubs.id)
- sport_id (public.sports.id)

**Key columns:**
- club_id ("uuid")
- sport_id (smallint)

**Constraints:**
- CHECK (("court_count" >= 0))

**Indexes (key ones):**
- Primary key on (club_id, sport_id)

---

## Table: public.clubs
**Purpose:** Stores clubs/venues (e.g., racquet clubs) used for match scheduling.

**PK:** id

**FKs:**
- N/A

**Key columns:**
- created_at (timestamp with time zone)

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.courts
**Purpose:** Stores courts within a club/venue.

**PK:** id

**FKs:**
- club_id (public.clubs.id)

**Key columns:**
- club_id ("uuid")
- created_at (timestamp with time zone)

**Constraints:**
- UNIQUE (club_id, court_code)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.group_members
**Purpose:** Stores membership rows for users within groups, including role/permission flags and lifecycle timestamps.

**PK:** id

**FKs:**
- group_id (public.groups.id)
- invited_by (auth.users.id) [nullable]
- removed_by (auth.users.id) [nullable]
- user_id (auth.users.id)

**Key columns:**
- accepted_at (timestamp with time zone, nullable)
- created_at (timestamp with time zone)
- group_id ("uuid")
- invited_by ("uuid", nullable)
- removed_at (timestamp with time zone, nullable)
- removed_by ("uuid", nullable)
- user_id ("uuid")
- join_method ("text")
- status ("public"."group_member_status")

**Constraints:**
- UNIQUE (group_id, user_id)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.groups
**Purpose:** Stores groups used as trust boundaries for invitations, scope, and membership.

**PK:** id

**FKs:**
- boundary_keeper_id (auth.users.id)
- created_by (auth.users.id)
- primary_sport_id (public.sports.id) [nullable]

**Key columns:**
- boundary_keeper_id ("uuid")
- created_at (timestamp with time zone)
- created_by ("uuid")
- primary_sport_id (smallint, nullable)

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (id)
- INDEX idx_groups_primary_sport_id USING btree ("primary_sport_id")

---

## Table: public.guest_sports
**Purpose:** Join table linking guests to sports.

**PK:** guest_id, sport_id

**FKs:**
- guest_id (public.guests.id)
- sport_id (public.sports.id)

**Key columns:**
- created_at (timestamp with time zone)
- guest_id ("uuid")
- sport_id (smallint)

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (guest_id, sport_id)
- INDEX idx_guest_sports_guest USING btree ("guest_id")
- INDEX idx_guest_sports_sport USING btree ("sport_id")

---

## Table: public.guests
**Purpose:** Stores guest identities (non-auth users) that can participate in matches via delegation/organizer workflows.

**PK:** id

**FKs:**
- created_by (auth.users.id)

**Key columns:**
- created_at (timestamp with time zone)
- created_by ("uuid")
- status ("text")

**Constraints:**
- CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.match_courts
**Purpose:** Join table linking matches to one or more courts.

**PK:** id

**FKs:**
- match_id (public.matches.id)

**Key columns:**
- created_at (timestamp with time zone)
- match_id ("uuid")
- end_at (timestamp with time zone, nullable)
- start_at (timestamp with time zone, nullable)

**Constraints:**
- CHECK ((("slot_index" >= 1) AND ("slot_index" <= 12)))
- UNIQUE (match_id, slot_index)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.match_participant_actions
**Purpose:** v1.6.1: Lifecycle event log for match participants. action_type values: reenter, invite, nominate, manual_confirm, delegate_manual_confirm, accept. Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.

**PK:** id

**FKs:**
- match_participant_id (public.match_participants.id)

**Key columns:**
- created_at (timestamp with time zone)
- match_participant_id ("uuid")
- action_type ("text")

**Constraints:**
- CHECK (("action_type" = ANY (ARRAY['invite'::"text", 'nominate'::"text", 'request_join'::"text", 'reenter'::"text", 'accept'::"text", 'approve'::"text", 'withdraw'::"text", 'decline'::"text", 'reject_request'::"text", 'revoke_invite'::"text", 'reject_nomination'::"text", 'remove_confirmed'::"text", 'remove'::"text", 'add_guest_org'::"text", 'add_guest_participant'::"text", 'manual_confirm'::"text", 'invited'::"text", 'nominated'::"text", 'requested'::"text", 'accepted'::"text", 'approved'::"text", 'withdrawn'::"text", 'removed'::"text", 'guest_added'::"text", 'declined'::"text", 'delegate_manual_confirm'::"text"])))

**Indexes (key ones):**
- Primary key on (id)
- INDEX idx_mpa_match USING btree ("match_id")
- INDEX idx_mpa_participant USING btree ("match_participant_id")
- INDEX mpa_match_id_created_at_idx USING btree ("match_id", "created_at" DESC)
- INDEX mpa_mp_id_created_at_idx USING btree ("match_participant_id", "created_at" DESC)
- UNIQUE INDEX uq_mpa_dedup USING btree ("match_participant_id", "action_type", "created_at")

---

## Table: public.match_participants
**Purpose:** Stores per-match participant rows (users and guests), including invitation, acceptance, and approval timestamps.

**PK:** id

**FKs:**
- created_by (auth.users.id)
- guest_id (public.guests.id) [nullable]
- manual_confirmed_by (auth.users.id) [nullable]
- match_id (public.matches.id)
- user_id (auth.users.id) [nullable]

**Key columns:**
- confirmed_at (timestamp with time zone, nullable)
- created_at (timestamp with time zone)
- created_by ("uuid")
- guest_id ("uuid", nullable)
- manual_confirmed_by ("uuid", nullable)
- match_id ("uuid")
- org_approved_at (timestamp with time zone, nullable)
- participant_accepted_at (timestamp with time zone, nullable)
- removed_at (timestamp with time zone, nullable)
- user_id ("uuid", nullable)
- join_method ("public"."match_join_method")
- status ("public"."match_participant_status")

**Constraints:**
- CHECK ((("participant_accepted_via" IS NULL) OR ("participant_accepted_via" = ANY (ARRAY['in_app'::"text", 'manual'::"text", 'delegate_manual'::"text"]))))
- CHECK (((("user_id" IS NOT NULL) AND ("guest_id" IS NULL)) OR (("user_id" IS NULL) AND ("guest_id" IS NOT NULL))))

**Indexes (key ones):**
- Primary key on (id)
- UNIQUE INDEX uq_match_participants_active_user USING btree ("match_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"))
- UNIQUE INDEX uq_mp_active_guest USING btree ("match_id", "guest_id") WHERE (("guest_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"))
- UNIQUE INDEX uq_mp_active_user USING btree ("match_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"))

---

## Table: public.matches
**Purpose:** Stores match records including schedule, venue, admission settings, and scope.

**PK:** id

**FKs:**
- club_id (public.clubs.id) [nullable]
- organizer_id (auth.users.id)
- sport_id (public.sports.id)

**Key columns:**
- start_time (time without time zone)
- can_participants_add_guests (boolean)
- can_participants_invite_users (boolean)
- can_participants_manage_participants (boolean)
- club_id ("uuid", nullable)
- created_at (timestamp with time zone)
- organizer_id ("uuid")
- sport_id (smallint)
- duration_minutes (integer)
- game_type ("text")
- invitation_scope_group_ids ("uuid"[])
- match_date ("date")

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (id)
- INDEX idx_matches_sport_id USING btree ("sport_id")

---

## Table: public.notifications
**Purpose:** Stores notifications to deliver to users about match/group events and system actions.

**PK:** id

**FKs:**
- N/A

**Key columns:**
- created_at (timestamp with time zone)
- read_at (timestamp with time zone, nullable)

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (id)
- INDEX idx_notifications_recipient_created_at USING btree ("recipient_user_id", "created_at" DESC)

---

## Table: public.profiles
**Purpose:** Stores application-level user profiles mapped to auth users.

**PK:** id

**FKs:**
- id (auth.users.id)
- primary_club_id (public.clubs.id) [nullable]

**Key columns:**
- created_at (timestamp with time zone)
- id ("uuid")
- is_super_admin (boolean)
- primary_club_id ("uuid", nullable)
- updated_at (timestamp with time zone)
- plays_doubles (boolean)
- plays_singles (boolean)

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.sports
**Purpose:** Reference table of sports supported by the app.

**PK:** id

**FKs:**
- N/A

**Key columns:**
- created_at (timestamp with time zone)
- is_active (boolean)

**Constraints:**
- UNIQUE (code)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.user_personal_remarks
**Purpose:** Identity v1.5: private remark labels (owner-only). Used for display priority in group context.

**PK:** id

**FKs:**
- group_id (public.groups.id) [nullable]
- owner_id (auth.users.id)
- target_user_id (auth.users.id)

**Key columns:**
- created_at (timestamp with time zone)
- group_id ("uuid", nullable)
- owner_id ("uuid")
- target_user_id ("uuid")
- updated_at (timestamp with time zone)

**Constraints:**
- UNIQUE (owner_id, target_user_id, group_id)

**Indexes (key ones):**
- Primary key on (id)

---

## Table: public.user_roster_guests
**Purpose:** User-specific roster of frequently used guests for quick reuse/invites.

**PK:** owner_user_id, guest_id

**FKs:**
- guest_id (public.guests.id)

**Key columns:**
- created_at (timestamp with time zone)
- guest_id ("uuid")

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (owner_user_id, guest_id)
- INDEX idx_user_roster_guests_guest USING btree ("guest_id")
- INDEX idx_user_roster_guests_owner USING btree ("owner_user_id")

---

## Table: public.user_sports
**Purpose:** Join table linking users to sports.

**PK:** user_id, sport_id

**FKs:**
- sport_id (public.sports.id)
- user_id (auth.users.id)

**Key columns:**
- created_at (timestamp with time zone)
- sport_id (smallint)
- user_id ("uuid")

**Constraints:**
- N/A

**Indexes (key ones):**
- Primary key on (user_id, sport_id)
- INDEX idx_user_sports_sport USING btree ("sport_id")
- INDEX idx_user_sports_user USING btree ("user_id")

---