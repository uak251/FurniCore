-- Optional contact + avatar for self-service profile (PATCH /auth/me).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone varchar(40),
  ADD COLUMN IF NOT EXISTS profile_image_url text;
