ALTER TABLE "users" ADD COLUMN "workspace_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
