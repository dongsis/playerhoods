update public.venues
set
  name = 'Whiteoak Tennis Club',
  abbreviation = 'wtc'
where id = '3802862a-db80-40e5-bed0-c76e8a631fa8'
   or name = 'Whiteoak Tennis Venue';

update public.venues
set
  name = 'Wallace Park Tennis Club',
  abbreviation = 'wptc'
where name in ('Wallace Park Tennis Venue', 'Wallace Park Tennis Club');

update public.venues
set abbreviation = 'orc'
where name in ('Ontario Racquet Club', 'Ontario Racquet Venue');
