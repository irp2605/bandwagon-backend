import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  
  try {
    const files = await fs.readdir(migrationsDir);
    
    // Sort migration files by timestamp
    const migrationFiles = files
      .filter(file => file.endsWith('.js'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      try {
        console.log(`Running migration: ${file}`);
        const migrationPath = path.join(migrationsDir, file);
        const migration = await import(`file://${migrationPath}`);
        
        if (migration.up) {
          await migration.up();
          console.log(`Migration ${file} completed successfully`);
        }
      } catch (error) {
        console.error(`Error running migration ${file}:`, error);
        throw error;
      }
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration process failed:', error);
    throw error;
  }
}

export async function rollbackMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  
  try {
    const files = await fs.readdir(migrationsDir);
    
    // Sort in reverse order for rollback
    const migrationFiles = files
      .filter(file => file.endsWith('.js'))
      .sort()
      .reverse();

    console.log(`Rolling back ${migrationFiles.length} migrations`);

    for (const file of migrationFiles) {
      try {
        console.log(`Rolling back migration: ${file}`);
        const migrationPath = path.join(migrationsDir, file);
        const migration = await import(`file://${migrationPath}`);
        
        if (migration.down) {
          await migration.down();
          console.log(`✓ Rollback ${file} completed successfully`);
        }
      } catch (error) {
        console.error(`✗ Error rolling back migration ${file}:`, error);
        throw error;
      }
    }
    
    console.log('All rollbacks completed successfully');
  } catch (error) {
    console.error('Rollback process failed:', error);
    throw error;
  }
}