-- Run once against your FurniCore PostgreSQL database.
ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_theme VARCHAR(64);
