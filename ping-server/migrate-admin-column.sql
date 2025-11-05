-- Migration: Add is_admin column to existing users table
-- Run this if you already have users in the database

-- Add is_admin column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false;
    RAISE NOTICE 'Column is_admin added successfully';
  ELSE
    RAISE NOTICE 'Column is_admin already exists';
  END IF;
END $$;

-- Optionally, make the first user an admin
-- Uncomment the next line if you want to promote the first registered user to admin
UPDATE users SET is_admin = true WHERE id = (SELECT MIN(id) FROM users);
