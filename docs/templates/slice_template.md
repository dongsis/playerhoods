# Slice <N>: <Title> (playerhoods.com)

0. Dependency Declaration (MANDATORY)

This task depends on the following authoritative documents:
docs/constitution/GroupConstitution.md
docs/specs/GroupContract_v1.md

You must comply with them strictly.
Do not reinterpret, extend, or invent concepts.

1. Slice Context
Project: playerhoods.com
Domain: Group / Membership / Boundary System
Slice ID: Slice-__
Purpose: (fill in one sentence, boundary-oriented)

2. What Exists (Assume as Given)
You must assume the following already exist and are correct:
groups table
group_members table
RLS enabled on both tables
Existing enum values are defined ONLY in GroupContract_v1.md
This is a living system, not a greenfield rewrite
Do NOT recreate or redefine them unless explicitly instructed.

3. Task Scope (What You Are Allowed to Do)
You are allowed to:
☐ Write patch-style SQL migrations
☐ Add / adjust RLS policies
☐ Add helper functions / triggers if required by invariants
☐ Propose Contract changes (but NOT implement them silently)

You are NOT allowed to:
⛔ Introduce new enum values
⛔ Invent new roles or concepts
⛔ Add social features (chat, feed, friends, likes, ratings)
⛔ Bypass database-level constraints for convenience

4. Task Definition (TODO)

Goal:
TODO: describe the outcome in terms of boundary correctness, not UX
Non-goals:
TODO: explicitly list what must NOT be done

5. Output Requirements

Your output must include:
A short explanation of how this slice respects the Constitution
A patch-style SQL (no full rebuild)
Any assumptions or edge cases
If blocked: a Contract v2 proposal, not a workaround

6. Acknowledgement

Before producing output, you must confirm:
“I understand and will comply with the Constitution and Contract.
I will not invent or reinterpret system concepts.”