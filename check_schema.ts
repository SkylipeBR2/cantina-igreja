import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  // Query to get columns for order_items
  const { data: cols, error: colsErr } = await supabase
    .rpc('get_schema_info', {}); // We might not have this RPC.

  // Instead let's just fetch one row of order_items to infer schema
  const { data, error } = await supabase.from('order_items').select('*').limit(1);
  console.log('order_items error:', error);
  console.log('order_items sample:', data);
  
  const { data: data2, error: error2 } = await supabase.from('orders').select('*').limit(1);
  console.log('orders error:', error2);
  console.log('orders sample:', data2);
}

checkSchema();
