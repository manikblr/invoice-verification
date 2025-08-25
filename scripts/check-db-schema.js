// Quick script to check database schema
const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('Missing Supabase credentials');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Checking database schema...');
  
  try {
    // Check if validation_sessions table exists
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
      
    if (error) {
      console.error('Error querying tables:', error);
    } else {
      console.log('Public tables:', tables.map(t => t.table_name));
    }
    
    // Try to check validation_sessions columns
    const { data: columns, error: colError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'validation_sessions');
      
    if (colError) {
      console.error('Error querying columns:', colError);
    } else {
      console.log('validation_sessions columns:', columns);
    }
    
  } catch (err) {
    console.error('Database check failed:', err);
  }
}

checkSchema();