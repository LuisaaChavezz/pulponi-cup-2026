-- Auditoría: ejecutar en Supabase SQL Editor para ver el estado real de la tabla.

-- Columnas
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reactions'
ORDER BY ordinal_position;

-- Constraints (PK, UNIQUE, CHECK, FK)
SELECT
  c.conname AS constraint_name,
  c.contype AS type,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'reactions'
ORDER BY c.conname;

-- Índices únicos
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'reactions'
ORDER BY indexname;
