const url = 'https://llzbnibrhxufwacqgcue.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsemJuaWJyaHh1ZndhY3FnY3VlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI5NDYzMywiZXhwIjoyMDkyODcwNjMzfQ.7d9c6LkHvJiei8tJOlaqN-czN0bXAkSCLXJ5t6c6Zw0';

async function fetchOptions() {
  const res = await fetch(`${url}/rest/v1/orders`, {
    method: 'OPTIONS',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json(); // Wait, OPTIONS might not return JSON. Let's just do a GET with header Accept: application/openapi+json
  console.log(data);
}

async function fetchOpenAPI() {
  const res = await fetch(`${url}/rest/v1/`, {
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Accept': 'application/openapi+json' }
  });
  const data = await res.json();
  const props = data.definitions.orders.properties;
  console.log('status_preparo type:', props.status_preparo);
  console.log('order_items props:', data.definitions.order_items.properties);
}

fetchOpenAPI();
