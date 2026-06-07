CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT,
  password_hash TEXT NOT NULL,
  stripe_customer_id TEXT,
  role TEXT NOT NULL DEFAULT 'patient',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  intake_email TEXT,
  contact_phone TEXT,
  street_address TEXT,
  notes TEXT,
  scheduled_at TIMESTAMPTZ
);

INSERT INTO users (
  email,
  first_name,
  last_name,
  phone_number,
  password_hash,
  stripe_customer_id,
  role,
  created_at
) VALUES
  (
    'clara.oswald@example.com',
    'Clara',
    'Oswald',
    '+1 (206) 555-0199',
    '$2b$10$productionHashForClara',
    'cus_live_clara_001',
    'patient',
    '2026-05-28T10:00:00Z'
  ),
  (
    'daniel.pink@example.com',
    'Daniel',
    'Pink',
    '+1 (503) 555-0142',
    '$2b$10$productionHashForDaniel',
    'cus_live_daniel_002',
    'billing_admin',
    '2026-05-30T14:15:00Z'
  );

INSERT INTO appointments (
  user_id,
  intake_email,
  contact_phone,
  street_address,
  notes,
  scheduled_at
) VALUES
  (
    1,
    'clara.oswald@example.com',
    '+1 (206) 555-0199',
    '1120 Pine Street, Seattle, WA 98101',
    'Follow-up intake with billing consent already recorded.',
    '2026-06-10T16:30:00Z'
  ),
  (
    2,
    'daniel.pink@example.com',
    '+1 (503) 555-0142',
    '742 Market Street, Portland, OR 97205',
    'Needs a realistic appointment row for local dashboard testing.',
    '2026-06-12T18:00:00Z'
  );
