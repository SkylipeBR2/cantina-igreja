const url = 'https://llzbnibrhxufwacqgcue.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsemJuaWJyaHh1ZndhY3FnY3VlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI5NDYzMywiZXhwIjoyMDkyODcwNjMzfQ.7d9c6LkHvJiei8tJOlaqN-czN0bXAkSCLXJ5t6c6Zw0';

async function fetchRpcs() {
  // Query pg_proc to find custom functions
  const res = await fetch(`${url}/rest/v1/rpc/sql`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `SELECT proname, pg_get_functiondef(oid) FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE nspname = 'public';`
    })
  });
  
  const data = await res.json();
  console.log(data);
}

fetchRpcs();
