import { beforeAll, afterAll, beforeEach } from 'vitest';
import { runMigrations, rollbackMigrations } from '../utils/migrate.js';
import pool from '../config/db.js';

beforeAll(async () => {
  // Ensure we're in test environment
  process.env.NODE_ENV = 'test';
  
  // Run migrations to set up test database schema
  console.log('Setting up test database...');
  await runMigrations();
  console.log('Test database setup complete');
});

afterAll(async () => {
  // Clean up database and close connections
  console.log('Cleaning up test database...');
  await rollbackMigrations();
  await pool.end();
  console.log('Test cleanup complete');
});

beforeEach(async () => {
  // Clean up data between tests (but keep schema)
  // Order matters due to foreign key constraints
  await pool.query('TRUNCATE TABLE concert_group_members RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE concert_groups RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE user_artists RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE user_top_artists RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE user_relations RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE spotify_oauth_states RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE artists RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
});