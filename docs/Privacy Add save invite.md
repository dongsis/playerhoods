PlayerHoods Privacy and Add/Save/Invite MVP Plan

This document outlines the minimum‑viable privacy and invitation model for PlayerHoods, the working name for our player discovery platform. The goal is to allow people to grow their trusted playing circles without exposing sensitive relationship data or turning the product into a social network. The scheme described here is based on a three‑level discovery volume, a consent mechanism for adding someone to your playerhood, and a clear distinction between saving a player and inviting them to join a match.

1 Product naming and terminology
PlayerHoods — the product/platform name.
My PlayerHood — a user’s personal trusted playing circle. It is a single relationship list per person, not a separate list for each sport.
Add to PlayerHood (Save) — a private, one‑way relationship indicating that you want to remember and later invite another player. This is not a friend request: it is silent, it does not require reciprocity, and it does not create a “connection” visible to others.
Request to Add — the consent gate. If you find someone through a known contact lookup or a venue name search and they are not already visible to you, you can ask to add them. They must approve before you can see their basic profile, add them to your playerhood or invite them.
Invite — an action to bring a player into a match or group. All invites require the recipient’s acceptance. When the caller is not the organiser, the backend can still record join_method = nominated, but the user interface should consistently use Invite instead of “Nominate.”
2 User settings: Privacy & Discovery

There are only two settings exposed to the user in the privacy section:

2.1 Player Discovery Volume

This slider controls passive discovery and recommendation. It has three levels:

Level	Description	Passive recommendations	Known‑contact lookup (email/phone)	Same venue/club name search
Quiet	Do not actively recommend me. Only players who already share a clear playing context can see my basic profile.	None	Requestable – people who know your exact email/phone may see a limited card and request to add.	No
My PlayerHood	Help me grow my playing circle through real playing connections. PlayerHoods will not show who suggested whom or reveal mutual players.	Only via trusted playing context (confirmed match history, accepted invites, private teams or leagues).	Requestable – exact email/phone lookups can request to add unless you already have a trusted context.	Requestable – same venue/club name search can request to add.
Recommended	PlayerHoods can recommend me to suitable players based on sport, level, area and playing preferences. Recommended does not mean public.	Suitable players only	Visible – if someone knows your exact email/phone they can see your basic profile and add you.	Visible – if someone searches your name in the same venue/club they can see your basic profile and add you.

The discovery volume does not affect direct contact lookups or explicit activity contexts (e.g. matches or private groups): those always allow the minimum profile visibility needed to coordinate play.

2.2 Accept New Invites

This toggle controls whether visible players can invite you to new matches or groups. Turning it off hides the invite button for new unsolicited invites and removes you from recommendation lists, but it does not affect existing matches or groups. It does not hide you from lookup flows.

2.3 Privacy note

Your phone, email and private contact details are never shown to other players. People who know your exact email or phone or who search your name in a shared venue or club may see a limited card and request to add you to their PlayerHood. They will only gain access to your profile if you approve.

3 Lookup methods

Besides passive recommendations, the system supports two intentional lookup methods:

Exact email/phone lookup — A strong known‑contact signal. It requires the user to enter the full email or phone number. Fuzzy searches are not allowed. When matched, the result depends on the target’s discovery volume as shown in the table above. The API must not reveal whether the match was via email or phone, or even whether the search matched at all; failed searches should return a generic “no discoverable player found” response.
Same venue/club name search — A scoped lookup for finding players within a selected club or venue context. It is not a global name search. The results are governed by the discovery volume: users set to Quiet do not appear; My PlayerHood users appear as requestable; Recommended users appear visible. If the venue is a verified private team or league, My PlayerHood users may also appear visible.

In both cases, the lookup can result in three states:

None — no result is returned; you cannot see the player or interact with them.
Requestable — you see a limited card (name, avatar, primary sport) and can press Request to Add. No invite or direct add options are available until the request is approved.
Visible — you see the full basic player profile (name, avatar, sports, level, general area, coarse availability, invite availability). You can add the player directly and invite them if they accept new invites.
4 Add / Save and Request to Add
4.1 Add (Save)

Adding someone to your PlayerHood means saving them in your personal circle. It is:

Private: Only you can see who is in your PlayerHood. Nobody else knows who you have saved.
One‑way: It does not create a mutual connection. The other person is not notified.
Silent: It does not send a friend request or follower notification.
Not a friend relationship: It merely makes it easier to invite them later.

Direct Add is only possible when the target’s lookup visibility is visible and you are not blocked. Once added, the user remains in your PlayerHood until you remove them. Removing someone is also silent.

4.2 Request to Add

When the lookup result is requestable, you cannot see the person’s full profile or add them directly. Instead you can send a Request to Add. This creates a pending entry in user_save_requests. The target can Allow or Decline the request. While the request is pending, duplicates are suppressed; if the request is declined, a cooldown prevents spamming.

If the target allows the request:

A row is written into user_invite_circle (or equivalent), giving you permission to see their basic profile and add them to your PlayerHood.
You can subsequently invite them if their Accept New Invites switch is on.

If the target declines:

No relationship is created.
The requester cannot try again until the cooldown expires.

Requests should be presented in the recipient’s inbox as:

Alex wants to add you to their PlayerHood.
If you allow this, Alex can save your basic player profile and invite you to play. Your phone and email will not be shared.

With buttons Allow and Decline (and optionally Block). The origin of the request (email lookup, phone lookup, or venue search) should not be disclosed to the recipient.

5 Invite mechanics

Invites are always explicit. Whether the caller is an organiser or a participant, the user‑facing button should be Invite, not “Nominate.” The backend may still record join_method = invited or join_method = nominated, but the product does not need to expose these details.

You can invite someone only if:

Their lookup visibility is visible (you can see their basic profile).
They have Accept New Invites set to on.
You are not blocked by them and you respect rate limits.
They are not already in the match.

All invites require the target to accept before they become confirmed participants. Organiser approval is still required when a non‑organiser issues the invite; the invite remains in a pending state until both acceptance and organiser approval are recorded.

6 Data handling and API restrictions
Do not return raw email, phone numbers, contact record IDs or private notes in any API response.
Do not reveal relationship strength, mutual counts, who saved whom or who suggested whom. The UI labels should only be generic (e.g. “Suggested player”, “From your PlayerHood”, “Good match”).
Exact contact lookups must not reveal whether the email or phone exists if the user is not discoverable. Always return a generic “no discoverable player found” response on failure.
Same club/venue name search must be scoped to the selected venue or club only. It cannot be used as a global name search.
Self‑claimed venues should not be treated as trust boundaries; they may only provide ranking hints in recommendations.
7 UI and copy guidelines
Settings page (Privacy & Discovery)
Privacy & Discovery

Player Discovery Volume
  Quiet
    Do not actively recommend me. Only players who already share a clear playing context with me can see my basic profile.
  My PlayerHood
    Help me grow my playing circle through real playing connections. PlayerHoods will not show who suggested whom or reveal mutual players.
  Recommended
    PlayerHoods can recommend me to suitable players based on sport, level, area and playing preferences. Recommended does not mean public.

Accept New Invites
  On: Players within your discovery volume can invite you to play. You always choose whether to join.
  Off: You will not receive new play invites or be recommended to new players. Your existing matches, groups and activities are not affected.

Your phone, email and private contact details are never shown to other players. People who know your exact email or phone, or search your name in a shared club or venue, may be able to request to add you to their PlayerHood.
Player cards and actions
Visible card — shows basic profile (name, avatar, sports, level, general area, coarse availability, invite availability). Buttons: Add to PlayerHood, Invite.
Requestable card — shows only name, avatar and primary sport. Button: Request to Add. No invite button.
No result — shows nothing; search returns “No discoverable player found.”
Inbox copy

For add requests:

Alex wants to add you to their PlayerHood.
If you allow this, Alex can save your basic player profile and invite you to play. Your phone and email will not be shared.

Buttons: Allow, Decline, Block.

For invites:

Invite — used for both organiser and non‑organiser invitations; the system handles organiser approval internally.
For organiser: after sending, show “Invite sent” or “Waiting for player to accept.”
For non‑organiser: after sending, show “Invite request sent. Waiting for organiser approval.”
Target always sees: “You’re invited to a match. Accept / Decline.”
8 Implementation notes
Add discovery volume and invite toggle fields to the profiles table rather than creating a new privacy settings table. Default discovery_volume can be 'recommended' and accepting_new_invites can default to true. Older fields like visible_in_city_discovery should be left in the database for compatibility but should not override the new logic.
Centralise permission checks in backend predicates such as get_lookup_visibility, canViewBasicProfile, canRequestAdd, canDirectAdd and canInviteUser. All discovery, lookup, and invitation flows must call these predicates instead of duplicating visibility logic.
Save Request (request to add) should remain in the system. It is not a fallback for passive discovery; it is an intentional consent flow after known contact or venue search.
Block is required before launch; it should override all discovery and invitation logic. Report, hide recommendation and rate limiting can follow in later phases.
Contact players (unregistered persons in someone’s address book) should never appear in passive discovery or lookup; they can only be saved or invited by owners or through explicit intro shares. Raw contact details for contact players must never be exposed.

This plan offers a clear, user‑friendly privacy model while still allowing familiar players to find each other. It preserves consent and privacy by requiring requests before adding someone to your PlayerHood and by never exposing direct contact information or relationship graphs.