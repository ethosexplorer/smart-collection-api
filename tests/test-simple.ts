// tests/test-simple.ts
import postgres from 'postgres';

async function testSimpleConnection() {
  console.log('🔌 Testing connection to smart-collection-api database...');
  
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/postgres';
  
  console.log('Using:', connectionString.replace(/:[^:]*@/, ':***@'));
  
  try {
    const sql = postgres(connectionString, { connect_timeout: 5 });
    
    // Test basic query
    const result = await sql`SELECT version() as version, current_database() as db`;
    console.log('✅ CONNECTED SUCCESSFULLY!');
    console.log('   Database:', result[0].db);
    console.log('   PostgreSQL Version:', result[0].version);
    
    // Test schema access
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    if (tables.length > 0) {
      console.log('   Available tables:', tables.map(t => t.table_name).join(', '));
    } else {
      console.log('   No tables found - ready for schema setup');
      console.log('   Run: bun run db:push');
    }
    
    await sql.end();
    return true;
    
  } catch (error: any) {
    console.log('❌ CONNECTION FAILED:', error.message);
    
    if (error.message.includes('database "smart-collection-api" does not exist')) {
      console.log('\n💡 SOLUTION: Create the database');
      console.log('   Run: createdb smart-collection-api');
      console.log('   Or: psql -U postgres -c "CREATE DATABASE \\"smart-collection-api\\";"');
    }
    
    return false;
  }
}

testSimpleConnection();