import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

// Only create client if configured
let supabaseInstance: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!isSupabaseConfigured()) {
      throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY environment variables.");
    }
    
    if (!supabaseInstance) {
      supabaseInstance = createClient(supabaseUrl, supabaseKey);
    }
    
    return (supabaseInstance as any)[prop];
  }
});
