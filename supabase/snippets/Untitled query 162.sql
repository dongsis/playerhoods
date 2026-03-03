const { data } = await supabase
  .from('profiles')
  .select(`
    id,
    display_name,
    auth:auth.users(email)
  `);