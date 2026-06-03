-- Issue #84: apply owner-approved venue cleanup candidates from PR #84 audit.
-- Scope is intentionally limited to exact google_place_id whitelist rows.

with approved_club_fixes (google_place_id, expected_name) as (
  values
    ('0x882b61b74195d303:0xb424dc62389eb74b', 'Burlington Hall Sporting Club'),
    ('0x882b41569772e547:0x6cdd0f48617f999c', 'Deer Wood Tennis Courts (Deer Run Tennis Club)'),
    ('0x882b47ddfeafa115:0xf6ae35b14b9d1f72', 'The Westacres Tennis Club'),
    ('0x882b464e60bb8675:0xc15efc59871b4df5', 'One Health Clubs'),
    ('0x882b5d97519304cb:0xa994ef0d8549c7ac', 'Oakville club tennis court'),
    ('0x882b5c8b891c95eb:0x42f6c82d6414defd', 'The Oakville Club'),
    ('0x882b3d89fc72d3e3:0xd93b771974942fc1', 'TJ’s Sports Club - Badminton and Volleyball'),
    ('0x882b44607d5f4763:0xedb00fc61dfa595', 'The Walden Club'),
    ('0x882b12c84df59ceb:0xb1ae937f1459b3eb', 'Georgetown Racquet Club'),
    ('0x882b5c939cd78bc1:0x4f09dec620624cf0', 'Wallace Park Tennis Club')
)
update public.venues v
set venue_kind = 'club'
from approved_club_fixes f
where v.google_place_id = f.google_place_id
  and v.name = f.expected_name
  and v.venue_kind is distinct from 'club';

with approved_renames (google_place_id, expected_current_name, new_name) as (
  values
    ('0x882b411da0cae48b:0x9575b42f6a729932', 'Tennis Court', 'Century City Park Tennis Court'),
    ('0x882b470019175c95:0xe5670d2cef867f39', 'Tennis courts', 'Stonebrook Park Tennis Courts')
)
update public.venues v
set name = r.new_name
from approved_renames r
where v.google_place_id = r.google_place_id
  and v.name = r.expected_current_name;
