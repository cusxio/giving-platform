-- The four funds a donation can go to. Each name must match one in src/core/brand/funds.ts,
-- capitalized, or a donation to it fails. A fund that already exists under any capitalization is
-- left as it is.
INSERT INTO "funds" ("id", "name")
SELECT substr(md5(random()::text || f.name), 1, 12), f.name
FROM (VALUES ('Offering'), ('Tithe'), ('Mission'), ('Future')) AS f(name)
WHERE NOT EXISTS (SELECT 1 FROM "funds" WHERE lower("funds"."name") = lower(f.name));
