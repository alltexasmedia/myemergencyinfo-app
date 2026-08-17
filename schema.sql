-- D1 schema for MyEmergencyInfo.net profiles
CREATE TABLE IF NOT EXISTS profiles (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  code                  TEXT UNIQUE NOT NULL,       -- permanent slug used in the public URL / QR code
  ghl_contact_id        TEXT,                       -- links back to the GHL contact record
  tier                  TEXT NOT NULL DEFAULT 'free', -- 'free' | 'paid'
  full_name             TEXT,
  emergency_contacts    TEXT,                       -- JSON array: [{name, relationship, phone}]
  doctors               TEXT,                       -- JSON array: [{name, specialty, phone}]
  medications           TEXT,                       -- JSON array: [{name, dosage, frequency}]
  conditions            TEXT,                       -- JSON array of strings, e.g. ["Diabetic (Type 1)"]
  allergies             TEXT,
  blood_type            TEXT,
  edit_token_hash       TEXT,                       -- SHA-256 hex of the current magic-link token (never store plaintext)
  edit_token_expires_at INTEGER,                     -- unix seconds
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_code ON profiles(code);
CREATE INDEX IF NOT EXISTS idx_profiles_ghl_contact ON profiles(ghl_contact_id);
