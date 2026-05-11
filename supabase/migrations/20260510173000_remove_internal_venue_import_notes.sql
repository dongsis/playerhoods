update public.venues
set notes = null
where btrim(coalesce(notes, '')) = 'Imported from venue candidate spreadsheet: Halton/Peel row.';
