require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

function getAsiaKolkataTodayBounds() {
  const d = new Date()
  const dateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
  return {
    start: `${dateString}T00:00:00.000+05:30`,
    end: `${dateString}T23:59:59.999+05:30`
  }
}

async function run() {
  const { start, end } = getAsiaKolkataTodayBounds();
  console.log(`Bounds: ${start} to ${end}`);
  
  const { data, error } = await supabase
    .from('post_service_feedback_messages')
    .select('id, updated_at, effective_rating, cre_status')
    .gte('updated_at', start)
    .lte('updated_at', end)
    .limit(10);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(JSON.stringify(data, null, 2));
}

run();
