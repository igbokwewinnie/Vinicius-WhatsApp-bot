import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLikelySupabaseProjectUrl } from "@/lib/supabase-env";

let client: SupabaseClient | undefined;

export function getSupabaseServer(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isLikelySupabaseProjectUrl(supabaseUrl)) {
    throw new Error("Invalid or missing env var: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseServiceRoleKey) {
    throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");
  }

  const url = supabaseUrl;

  client = createClient(url, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}

export const supabaseServer = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getSupabaseServer();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
