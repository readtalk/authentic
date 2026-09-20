//
CREATE UNIQUE INDEX idx_user_username ON user(username) WHERE username IS NOT NULL;
