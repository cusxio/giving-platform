-- Lists the public schema's columns, indexes, constraints and triggers, one line each, with a hash
-- of the whole list on every row. Run it on two databases: when the fingerprints match, so do those
-- parts of their schemas; when they differ, compare the lines. Run it before recording the baseline
-- (see "Database changes" in AGENTS.md).
--
-- It leaves out NOT NULL constraints, which Postgres 18 lists as constraints and 17 does not; each
-- column line carries its nullability instead. It does not cover sequences, functions, extensions,
-- policies or data.

WITH schema_lines AS (
  SELECT format(
    'column %s.%s %s%s %s %s',
    table_name,
    column_name,
    data_type,
    coalesce(
      '(' || character_maximum_length || ')',
      '(' || datetime_precision || ')',
      '(' || numeric_precision || ',' || numeric_scale || ')',
      ''
    ),
    CASE is_nullable WHEN 'YES' THEN 'null' ELSE 'not null' END,
    coalesce('default ' || column_default, '')
  ) AS line
  FROM information_schema.columns
  WHERE table_schema = 'public'
  UNION ALL
  SELECT format('index %s%s', pg_get_indexdef(i.indexrelid), CASE WHEN i.indisvalid THEN '' ELSE ' INVALID' END)
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relnamespace = 'public'::regnamespace
  UNION ALL
  SELECT format('constraint %s %s %s', conrelid::regclass, conname, pg_get_constraintdef(oid))
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace AND contype <> 'n'
  UNION ALL
  SELECT format('trigger %s', pg_get_triggerdef(t.oid))
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
)
SELECT
  line,
  (SELECT md5(string_agg(line, E'\n' ORDER BY line)) FROM schema_lines) AS fingerprint
FROM schema_lines
ORDER BY line;
