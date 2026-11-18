/* ==========================================================
   MiRadio — site configuration
   Fill these in from Supabase → Project Settings → API.
   The "anon" / publishable key is designed to be public; the
   database rules in supabase/setup.sql keep each person's data
   private. Never put the "service_role" / secret key here.
   ========================================================== */
window.MI_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};

(function () {
  const c = window.MI_CONFIG;
  window.miDb =
    c.supabaseUrl && c.supabaseAnonKey && window.supabase
      ? window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey)
      : null;
})();
