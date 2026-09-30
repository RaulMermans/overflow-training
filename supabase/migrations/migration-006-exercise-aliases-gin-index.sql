-- Migration 006: Add GIN index for exercise alias containment search
-- Safe to run multiple times (CREATE INDEX IF NOT EXISTS)
-- Run this in the Supabase Dashboard SQL Editor

create index if not exists exercise_definitions_aliases_gin_idx
  on exercise_definitions
  using gin (aliases);
