5️⃣ Discoverability_Framework.md
Group Discoverability & Matching Framework v1.5
1. Venue Model

Rename clubs → venue

Venue Types:

Club

Public

Community

Private

2. Geographic Fields

country_code
admin1 (Province/State)
locality (City)
admin2 (District, optional)
postal_code (optional)

3. Group Attributes

Each group may define:

city

up to 3 primary venues

gender

age_range

level

play_time

visibility_mode:

private

discoverable

4. Discoverability Logic
4.1 Club Groups

Visible only to:

Members of that venue

4.2 Non-Club Groups

Discoverable if matching:

Same city

Matching gender (if specified)

Overlapping age_range

Similar level

Venue overlap (at least one)

5. Privacy Boundaries

Discoverability does not grant:

Invite rights

Manage rights

It only allows visibility and request.