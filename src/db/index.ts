// src/db/index.ts - COMPLETE VERSION WITH CONSTRAINTS
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

console.log('Starting Smart Collections API...');

let db: any = null;
let isConnected = false;

async function initializeDatabaseConstraints(client: any) {
  try {
    // Apply the constraint trigger
    await client`
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
    
    await client`
      DROP TRIGGER IF EXISTS enforce_collection_item_limit ON collection_items;
      CREATE TRIGGER enforce_collection_item_limit
          BEFORE INSERT ON collection_items
          FOR EACH ROW
          EXECUTE FUNCTION check_collection_item_limit();
    `;
    
    console.log('Database constraints applied successfully');
  } catch (error: any) {
    console.log('Could not apply database constraints:', error.message);
  }
}

async function initializeDatabase() {
  try {
    console.log('Attempting to connect to local PostgreSQL...');
    
    const connectionString = process.env.DATABASE_URL || "postgresql://postgres:@localhost:5432/smart-collection-api";
    
    console.log('Using connection string:', connectionString.replace(/:[^:]*@/, ':***@'));

    const client = postgres(connectionString, {
      ssl: false,
      connect_timeout: 10,
      idle_timeout: 20,
      max: 10,
    });

    // Test connection
    await client`SELECT 1 as connection_test`;
    
    // Apply database constraints
    await initializeDatabaseConstraints(client);
    
    db = drizzle(client, { schema });
    isConnected = true;
    console.log('Local PostgreSQL connected successfully!');
    
  } catch (error: any) {
    console.log('Database connection failed:', error.message);
    console.log('Using mock database for development');
    
    // Use mock database
    db = createMockDatabase();
    isConnected = false;
  }
}

function createMockDatabase() {
  console.log('Initializing enhanced mock database...');
  let itemCounts = new Map();
  
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
        returning: () => {
          // Mock the 5-item limit for collections
          if (table._?.name === 'collectionItems') {
            const collectionId = data.collectionId;
            const currentCount = itemCounts.get(collectionId) || 0;
            if (currentCount >= 5) {
              throw new Error('Collection cannot have more than 5 items');
            }
            itemCounts.set(collectionId, currentCount + 1);
          }
          
          return [{
            ...data,
            id: data.id || Math.floor(Math.random() * 1000) + 1,
            createdAt: new Date(),
            updatedAt: new Date()
          }];
        }
      })
    }),
    // Add other mock methods as needed
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => [],
          orderBy: () => []
        })
      })
    }),
    transaction: (fn: any) => fn({
      // Mock transaction methods
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => [{}]
          })
        })
      })
    })
  };
}

// Initialize database
initializeDatabase();

export { db, isConnected };
export type Database = typeof db;