const url = 'https://llzbnibrhxufwacqgcue.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsemJuaWJyaHh1ZndhY3FnY3VlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI5NDYzMywiZXhwIjoyMDkyODcwNjMzfQ.7d9c6LkHvJiei8tJOlaqN-czN0bXAkSCLXJ5t6c6Zw0';

async function fetchSchema() {
  const getTable = async (table) => {
    const res = await fetch(`${url}/rest/v1/${table}?limit=1`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const data = await res.json();
    console.log(`--- ${table} ---`);
    console.log(data);
  };
  await getTable('orders');
  await getTable('order_items');
  await getTable('items');
}
fetchSchema();
