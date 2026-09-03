SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%trip%' ORDER BY tablename;