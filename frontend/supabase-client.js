// Requires the Supabase UMD build to be loaded first (see index.html),
// which exposes a global `supabase` factory. We immediately shadow that
// name with the actual client instance, matching supabase-js docs.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // needed so invite/recovery links work
    },
});

// Mae it available to modules
window.supabaseClient = supabaseClient;