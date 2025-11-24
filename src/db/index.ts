import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

console.log('Starting Smart Collections API...');

let db: any = null;
let isConnected = false;

// Function to setup database constraints
async function setupDatabaseConstraints(sql: any) {
  try {
    console.log('Setting up database constraints...');
    
    // Execute each SQL command separately
    await sql`
      CREATE OR REPLACE FUNCTION check_collection_item_limit()
      RETURNS TRIGGER AS $$
      BEGIN
          IF (SELECT COUNT(*) FROM collection_items WHERE collection_id = NEW.collection_id) >= 5 THEN
              RAISE EXCEPTION 'Collection cannot have more than 5 items';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await new Promise(resolve => setTimeout(resolve, 100));

    await sql`
      DROP TRIGGER IF EXISTS enforce_collection_item_limit ON collection_items;
    `;

    await new Promise(resolve => setTimeout(resolve, 100));

    await sql`
      CREATE TRIGGER enforce_collection_item_limit
          BEFORE INSERT ON collection_items
          FOR EACH ROW
          EXECUTE FUNCTION check_collection_item_limit();
    `;

    console.log('Database constraints setup completed');
  } catch (error) {
    console.error('Failed to setup database constraints:', error);
    throw error;
  }
}

// Initialize real database connection with constraints
async function initializeRealDatabase() {
  try {
    // Use test database for tests, regular database for development
    const databaseName = process.env.NODE_ENV === 'test' ? 'smart-collections-test' : 'smart-collections';
    const connectionString = process.env.DATABASE_URL || `postgresql://postgres:@localhost:5432/${databaseName}`;
    
    const sql = postgres(connectionString);
    
    // Test connection
    const result = await sql`SELECT version()`;
    console.log('Database connected:', result[0].version);
    
    // Setup constraints
    await setupDatabaseConstraints(sql);
    
    // Initialize Drizzle with the schema
    const drizzleDb = drizzle(sql, { schema });
    isConnected = true;
    
    console.log('Real database initialized with constraints');
    return { db: drizzleDb, sql };
  } catch (error) {
    console.error('Real database connection failed:', error);
    throw error; // Don't fall back to mock - fail fast
  }
}

// Initialize database
async function initializeDatabase() {
  // ALWAYS use real database - no mock fallback
  return await initializeRealDatabase();
}

// Initialize database immediately (using top-level await)
try {
  const database = await initializeDatabase();
  db = database.db;
  isConnected = true;
  console.log(`Database initialized successfully (real PostgreSQL with constraints)`);
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1); // Exit if database connection fails
}

export { db, isConnected };
export type Database = typeof db;