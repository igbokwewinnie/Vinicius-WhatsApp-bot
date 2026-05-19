export function isLikelySupabaseProjectUrl(
  url: string | undefined,
): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname.endsWith(".supabase.co")) return false;
    return parsed.pathname === "" || parsed.pathname === "/";
  } catch {
    return false;
  }
}
