// src/db/index.ts - FIXED VERSION
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

console.log('🚀 Starting Smart Collections API...');

let db: any = null;
let isConnected = false;

async function initializeDatabase() {
  try {
    console.log('🔌 Attempting to connect to local PostgreSQL...');
    
    const connectionString = process.env.DATABASE_URL || "postgresql://postgres:@localhost:5432/postgres";
    
    console.log('Using connection string:', connectionString.replace(/:[^:]*@/, ':***@'));

    const client = postgres(connectionString, {
      ssl: false, // Disable SSL for local development
      connect_timeout: 10,
      idle_timeout: 20,
      max: 10,
    });

    // Test connection
    await client`SELECT 1 as connection_test`;
    
    db = drizzle(client, { schema });
    isConnected = true;
    console.log('✅ Local PostgreSQL connected successfully!');
    
  } catch (error: any) {
    console.log('⚠️ Database connection failed:', error.message);
    console.log('💡 Using mock database for development');
    
    // Use mock database
    db = createMockDatabase();
    isConnected = false;
  }
}

function createMockDatabase() {
  console.log('📝 Initializing enhanced mock database...');
  // Your mock database implementation
  return {
    insert: (table: any) => ({
      values: (data: any) => ({
        onConflictDoNothing: () => ({
          returning: () => [{
            ...data,
            id: data.id || Math.floor(Math.random() * 1000) + 1,
            createdAt: new Date(),
            updatedAt: new Date()
          }]
        }),
        returning: () => [{
          ...data,
          id: data.id || Math.floor(Math.random() * 1000) + 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      })
    }),
  };
}

// Initialize database
initializeDatabase();

export { db, isConnected };
export type Database = typeof db;