-- Migration number: 0002 	 2024-12-27T22:04:18.794Z
ALTER TABLE user ADD COLUMN username TEXT UNIQUE;
UPDATE user
SET username = 'user_' || substr(id, 1, 8)
WHERE username IS NULL;
