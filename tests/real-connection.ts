// scripts/test-connection.ts
import postgres from 'postgres';

async function testAllConnectionMethods() {
  console.log('🧪 Testing local PostgreSQL connection methods...\n');

  const methods = [
    {
      name: 'Environment Variable',
      config: process.env.DATABASE_URL
    },
    {
      name: 'Direct Config',
      config: {
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: '', // Leave empty if no password
        ssl: false
      }
    },
    {
      name: 'Connection String (No Password)',
      config: 'postgresql://postgres:@localhost:5432/postgres'
    },
    {
      name: 'Connection String (With Database)',
      config: 'postgresql://localhost:5432/postgres'
    }
  ];

  for (const method of methods) {
    console.log(`🔧 Testing: ${method.name}`);
    
    // Skip if environment variable is not set
    if (method.name === 'Environment Variable' && !method.config) {
      console.log('   ⚠️  SKIPPED: DATABASE_URL not set in environment');
      console.log('---');
      continue;
    }
    
    try {
      const sql = typeof method.config === 'string' 
        ? postgres(method.config, { connect_timeout: 5 })
        : postgres(method.config);
      
      const result = await sql`SELECT version() as version, current_database() as db, current_timestamp as time`;
      console.log('✅ SUCCESS:');
      console.log('   Database:', result[0].db);
      console.log('   Version:', result[0].version);
      console.log('   Time:', result[0].time);
      
      // Test if we can access the schema
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      console.log('   Tables:', tables.map(t => t.table_name));
      
      await sql.end();
    } catch (error: any) {
      console.log('❌ FAILED:', error.message);
      
      // Provide specific troubleshooting tips for local PostgreSQL
      if (error.message.includes('connection refused') || error.message.includes('ECONNREFUSED')) {
        console.log('   💡 Check: Is PostgreSQL service running?');
        console.log('   💡 Windows: net start postgresql');
        console.log('   💡 Mac: brew services start postgresql');
      }
      
      if (error.message.includes('database') && error.message.includes('does not exist')) {
        console.log('   💡 Check: Database "smart-collection-api" exists?');
        console.log('   💡 Run: createdb smart-collection-api');
      }
      
      if (error.message.includes('password authentication')) {
        console.log('   💡 Check: PostgreSQL password authentication');
        console.log('   💡 Try: Add password to connection string');
      }
      
      if (error.message.includes('timeout')) {
        console.log('   💡 Check: PostgreSQL is running on port 5432');
      }
    }
    console.log('---');
  }
}

testAllConnectionMethods();