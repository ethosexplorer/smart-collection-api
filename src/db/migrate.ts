import postgres from 'postgres';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function runMigrations() {
  try {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/postgres';
    const sql = postgres(connectionString);

    console.log('Running database migrations...');

    // Look for constraints.sql in the same directory as this file (src/db/)
    const constraintsPath = join(__dirname, 'constraints.sql');
    
    if (!existsSync(constraintsPath)) {
      console.log('constraints.sql not found in src/db/, trying project root...');
      
      // Fallback to project root
      const rootConstraintsPath = join(process.cwd(), 'constraints.sql');
      if (!existsSync(rootConstraintsPath)) {
        console.log('constraints.sql not found anywhere, creating database constraints directly...');
        await createConstraintsDirectly(sql);
      } else {
        const constraintsSQL = readFileSync(rootConstraintsPath, 'utf-8');
        await sql.unsafe(constraintsSQL);
      }
    } else {
      // Read and execute the constraints SQL from src/db/ directory
      const constraintsSQL = readFileSync(constraintsPath, 'utf-8');
      await sql.unsafe(constraintsSQL);
    }

    console.log('Database migrations completed successfully');
    await sql.end();
  } catch (error) {
    console.error('Database migrations failed:', error);
    throw error;
  }
}

async function createConstraintsDirectly(sql: any) {
  // Create function
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

  // Drop trigger if exists
  await sql`
    DROP TRIGGER IF EXISTS enforce_collection_item_limit ON collection_items;
  `;

  // Create trigger
  await sql`
    CREATE TRIGGER enforce_collection_item_limit
        BEFORE INSERT ON collection_items
        FOR EACH ROW
        EXECUTE FUNCTION check_collection_item_limit();
  `;
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  runMigrations();
}