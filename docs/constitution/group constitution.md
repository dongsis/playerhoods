Claude Group Constitution

(for playerhoods.com – system-level constraints)

0. Scope

This constitution applies to all discussions, designs, and implementations involving:

Group

Membership

Match

Invitations

Visibility

Permissions

Governance

Claude must always follow these rules unless explicitly instructed otherwise.

1. Core Concept: Group

Group is the only people-collection concept.

There are no friends, followers, social graphs, feeds, or chats.

Group is not a social network.

Group is an access boundary and an action boundary.

2. What a Group Is (and Is Not)
Group IS:

A boundary that defines:

who can be invited

who can see content

who can participate in actions (e.g. matches)

A stable, explainable container for offline coordination

Group IS NOT:

A chat room

A feed

A friendship container

An implicit relationship

All relationships must be explicit.

3. Relationship Rules (Hard Constraint)

No implicit relationships.

No auto-generated connections.

No “people you may know”.

No social inference.

All relationships require invite + accept.

Claude must never introduce automatic relationship upgrades.

4. Group Types (Same Concept, Different Constraints)

There is one concept: Group, with internal attributes.

Direct Group

Size: 2–4 members

No organizer

No approval workflows

Purpose: repeated direct play (singles / fixed doubles)

Join policy: invite_only only

Organized Group

Size: ≥ 5 members

Must have a boundary keeper (organizer)

Used when selection, rotation, or governance exists

Join policy can be:

invite_only

organizer_approval

auto_join

Claude must not introduce new group categories.

5. Organizer (Boundary Keeper)

Organizer is not a manager.

Organizer is a boundary responsibility role.

Organizer responsibilities:

Maintain membership boundary

Decide who can join or leave (depending on join_policy)

Preserve long-term group quality

Organizer is NOT:

A judge of people

A ranking authority

A social superior

6. Match Relationship to Group

A Match may reference a Group.

A Match may invite people across Groups.

Every Match has a frozen match boundary.

Match uses Groups.
Match never mutates Groups.

Claude must never introduce logic where a Match:

auto-creates a Group

modifies Group membership

upgrades relationships

7. Visibility & Content Sharing

Group is the visibility boundary for content.

Content visibility is decided at publish time.

Audience is frozen as a snapshot.

Membership changes:

Do NOT retroactively change content visibility.

No dynamic re-evaluation.

Claude must not introduce:

feed-style visibility

follower-based visibility

algorithmic distribution

8. Automation & Agents (Future-Safe Rule)

Automation may execute explicitly configured rules only.

Automation must not make value judgments.

Automation must not infer intent or suitability.

Automation reduces friction.
It does not replace human judgment.

9. Database & Security Principles

Boundary rules must be enforceable at the database level.

Constraints and RLS must reflect product semantics.

“Fail closed” is preferred over “fail open”.

Claude must not weaken constraints for convenience.

10. Design Philosophy (Non-Negotiable)

Offline reality first.

Low social pressure.

High explainability.

No magical behavior.

No hidden state transitions.

If a behavior cannot be clearly explained to a user, it must not exist.

11. Absolute Prohibitions

Claude must never introduce:

Friends

Followers

Likes as reputation

Scores / ratings

Automatic trust signals

Implicit social graphs

Chat systems

If any of these appear, Claude must stop and revise.

12. Final Rule

When in doubt, prefer clarity over convenience,
and explicit boundaries over automation.

This rule overrides all others.



