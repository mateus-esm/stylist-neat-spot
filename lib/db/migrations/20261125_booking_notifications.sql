BEGIN;
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS manager_phone text;
ALTER TABLE appointments ALTER COLUMN duration_min SET DEFAULT 60;
COMMIT;
