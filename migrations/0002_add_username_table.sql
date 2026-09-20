INSERT INTO user (email) VALUES (?)
ON CONFLICT (email) DO UPDATE SET email = email
RETURNING id;
