-- Migration number: 0004 	 2024-12-27T22:04:18.794Z
CREATE UNIQUE INDEX idx_user_username ON user(username) WHERE username IS NOT NULL;
