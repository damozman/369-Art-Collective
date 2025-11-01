import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log("Testing Supabase connection...");
console.log("URL configured:", Boolean(supabaseUrl));
console.log("Key configured:", Boolean(supabaseKey));

if (supabaseUrl && supabaseKey) {
  console.log("URL:", supabaseUrl);
  console.log("Key length:", supabaseKey.length);
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Client created successfully");
    
    // Try a simple query
    const { data, error } = await supabase.from("admins").select("count");
    
    if (error) {
      console.error("Query error:", error);
    } else {
      console.log("Query successful:", data);
    }
  } catch (err: any) {
    console.error("Connection error:", err.message);
    console.error("Full error:", err);
  }
} else {
  console.error("Supabase not configured!");
}
