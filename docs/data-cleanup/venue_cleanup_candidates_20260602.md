# Venue Cleanup Candidate Audit

Date: 2026-06-02

Status: candidate audit report. The 12 listed rows were later approved for the exact whitelist migration in PR #84; do not use this document as approval for any broader venue data mutation.

## Source

- Canonical runtime table used by the app: `public.venues`.
- Local static audit source: `supabase/migrations/20260509210000_seed_halton_peel_venues_from_xlsx.sql`.
- Source note: this migration seeds/reconciles Halton and Peel venues from `playerhoods_venue_cleaned_with_courts_v4 (3).xlsx` and declares 329 source candidates.
- Audit rows parsed: 329.
- Stable source id used in this report: `google_place_id` when present, otherwise synthetic seed row number.

No production credentials, Supabase Remote connection, database mutation, or provider traffic was used to generate this report.

## Summary Counts

By rule:

- club_name_type_fix: 10
- generic_tennis_court_park_rename: 2

By confidence:

- high: 12
- medium: 0
- low: 0

By rule and confidence:

- club_name_type_fix:high: 10
- generic_tennis_court_park_rename:high: 2

Already-correct club-name rows not counted as fixes: 44.

## Candidate Rows

| stable source id | current name | current classification | city | address | detected rule | proposed classification | proposed name | confidence | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0x882b61b74195d303:0xb424dc62389eb74b | Burlington Hall Sporting Club | park | Burlington | 960 Cumberland Ave, Burlington, ON L7N 3J6 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b41569772e547:0x6cdd0f48617f999c | Deer Wood Tennis Courts (Deer Run Tennis Club) | park | Mississauga | 1075 Rathburn Rd W, Mississauga, ON L5C 3V6 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b411da0cae48b:0x9575b42f6a729932 | Tennis Court | park | Mississauga | Century City Park, 933 Focal Rd, Mississauga, ON L5V 1M8 | generic_tennis_court_park_rename |  | Century City Park Tennis Court | high | Generic tennis court name and location_text contains a recognizable park name. Source operation: insert_candidate. |
| 0x882b470019175c95:0xe5670d2cef867f39 | Tennis courts | park | Mississauga | Stonebrook Park Tennis Court, 305 Mississauga Vly Blvd, Mississauga, ON L5A 3S2 | generic_tennis_court_park_rename |  | Stonebrook Park Tennis Courts | high | Generic tennis court name and location_text contains a recognizable park name. Source operation: insert_candidate. |
| 0x882b47ddfeafa115:0xf6ae35b14b9d1f72 | The Westacres Tennis Club | park | Mississauga | 2166 Westfield Dr, Mississauga, ON L4Y 1J7 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b464e60bb8675:0xc15efc59871b4df5 | One Health Clubs | park | Mississauga | 2021 Cliff Rd, Mississauga, ON L5A 0A7 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b5d97519304cb:0xa994ef0d8549c7ac | Oakville club tennis court | park | Oakville | Oakville, ON L6J 2Y3 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b5c8b891c95eb:0x42f6c82d6414defd | The Oakville Club | park | Oakville | 56 Water St, Oakville, ON L6J 2Y3 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b3d89fc72d3e3:0xd93b771974942fc1 | TJ’s Sports Club - Badminton and Volleyball | school | Brampton | Unit 4a, 1055 Clark Blvd, Brampton, ON L6T 3W4 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b44607d5f4763:0xedb00fc61dfa595 | The Walden Club | park | Mississauga | 1400 Walden Cir, Mississauga, ON L5J 4N2 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: insert_candidate. |
| 0x882b12c84df59ceb:0xb1ae937f1459b3eb | Georgetown Racquet Club | park | Georgetown | 215 Armstrong Ave, Georgetown, ON L7G 4T1 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: update_candidate. |
| 0x882b5c939cd78bc1:0x4f09dec620624cf0 | Wallace Park Tennis Club | park | Oakville | 245 Reynolds St, Oakville, ON L6J 3L2 | club_name_type_fix | club |  | high | Venue name contains "club" but venue_kind is not club. Source operation: update_candidate. |

## Notes

- Rule A flags venue names containing `club` case-insensitively when `venue_kind` is not already `club`.
- Rule B only flags exactly generic `Tennis Court` / `Tennis Courts` names when `location_text` contains a recognizable park name.
- Generic tennis court rows without a recognizable park name in `location_text` are not auto-proposed here.
- This report intentionally proposes no updates. Any row-level changes need a separate owner-approved data update issue.
