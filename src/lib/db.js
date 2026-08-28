import { generateCode, generateEditToken, hashToken } from "./codegen.js";

const EDIT_TOKEN_TTL_SECONDS = 60 * 60 * 48; // 48 hours

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function parseJsonColumns(row) {
  if (!row) return row;
  return {
    ...row,
    emergency_contacts: normalizeEntryList(safeParse(row.emergency_contacts, [])),
    doctors: normalizeEntryList(safeParse(row.doctors, [])),
    medications: normalizeEntryList(safeParse(row.medications, [])),
    conditions: normalizeStringList(safeParse(row.conditions, [])),
  };
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// GHL's custom fields are plain text boxes, not structured repeaters, so a
// contact/doctor/medication can arrive (and get stored) as a single freeform
// string (e.g. someone typed "Jane Doe 555-1234" into one box) instead of
// the {name, relationship/specialty/dosage, phone} shape the render/PDF
// code expects. Normalizing here — the one place every read flows through —
// means every page shows that text as a best-effort entry instead of
// crashing on a missing .forEach/.map.
function normalizeEntryList(value) {
  const arr = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value.trim()] : [];
  return arr.map((entry) => (entry && typeof entry === "object" ? entry : { name: String(entry) }));
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export async function getProfileByCode(env, code) {
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE code = ?")
    .bind(code)
    .first();
  return parseJsonColumns(row);
}

export async function getProfileByGhlContactId(env, ghlContactId) {
  const row = await env.DB.prepare(
    "SELECT * FROM profiles WHERE ghl_contact_id = ?"
  )
    .bind(ghlContactId)
    .first();
  return parseJsonColumns(row);
}

async function generateUniqueCode(env) {
  // Collision probability is astronomically low at this alphabet/length,
  // but we check anyway since the code must be permanent and unique.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode(7);
    const existing = await env.DB.prepare(
      "SELECT 1 FROM profiles WHERE code = ?"
    )
      .bind(candidate)
      .first();
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique code after 5 attempts");
}

// Creates a profile on first webhook from GHL, or updates the existing one
// for that contact. The permanent `code` (and therefore the public URL and
// QR code) is only ever assigned once, on creation.
export async function upsertProfileFromWebhook(env, payload) {
  const existing = payload.ghl_contact_id
    ? await getProfileByGhlContactId(env, payload.ghl_contact_id)
    : null;

  const ts = nowSeconds();
  const fields = {
    full_name: payload.full_name ?? null,
    tier: payload.tier ?? "free",
    emergency_contacts: JSON.stringify(payload.emergency_contacts ?? []),
    doctors: JSON.stringify(payload.doctors ?? []),
    medications: JSON.stringify(payload.medications ?? []),
    conditions: JSON.stringify(payload.conditions ?? []),
    allergies: payload.allergies ?? null,
    blood_type: payload.blood_type ?? null,
  };

  if (existing) {
    await env.DB.prepare(
      `UPDATE profiles SET full_name=?, tier=?, emergency_contacts=?, doctors=?,
       medications=?, conditions=?, allergies=?, blood_type=?, updated_at=?
       WHERE code=?`
    )
      .bind(
        fields.full_name,
        fields.tier,
        fields.emergency_contacts,
        fields.doctors,
        fields.medications,
        fields.conditions,
        fields.allergies,
        fields.blood_type,
        ts,
        existing.code
      )
      .run();
    return { code: existing.code, isNew: false };
  }

  const code = await generateUniqueCode(env);
  await env.DB.prepare(
    `INSERT INTO profiles
     (code, ghl_contact_id, tier, full_name, emergency_contacts, doctors,
      medications, conditions, allergies, blood_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      code,
      payload.ghl_contact_id ?? null,
      fields.tier,
      fields.full_name,
      fields.emergency_contacts,
      fields.doctors,
      fields.medications,
      fields.conditions,
      fields.allergies,
      fields.blood_type,
      ts,
      ts
    )
    .run();
  return { code, isNew: true };
}

// Issues a fresh one-time edit link. Only the SHA-256 hash is stored —
// the plaintext token is returned once, for GHL to email/text to the
// customer, and is never persisted anywhere in plaintext.
export async function issueEditToken(env, code) {
  const token = generateEditToken();
  const hash = await hashToken(token);
  const expiresAt = nowSeconds() + EDIT_TOKEN_TTL_SECONDS;
  await env.DB.prepare(
    "UPDATE profiles SET edit_token_hash=?, edit_token_expires_at=? WHERE code=?"
  )
    .bind(hash, expiresAt, code)
    .run();
  return { token, expiresAt };
}

export async function getProfileByValidEditToken(env, token) {
  const hash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT * FROM profiles WHERE edit_token_hash = ?"
  )
    .bind(hash)
    .first();
  if (!row) return null;
  if (row.edit_token_expires_at < nowSeconds()) return null;
  return parseJsonColumns(row);
}

export async function updateProfileFields(env, code, fields) {
  const ts = nowSeconds();
  await env.DB.prepare(
    `UPDATE profiles SET full_name=?, emergency_contacts=?, doctors=?,
     medications=?, conditions=?, allergies=?, blood_type=?, updated_at=?
     WHERE code=?`
  )
    .bind(
      fields.full_name ?? null,
      JSON.stringify(fields.emergency_contacts ?? []),
      JSON.stringify(fields.doctors ?? []),
      JSON.stringify(fields.medications ?? []),
      JSON.stringify(fields.conditions ?? []),
      fields.allergies ?? null,
      fields.blood_type ?? null,
      ts,
      code
    )
    .run();
}

// Single-use: clear the token hash once it's been used to save an edit,
// so the same link can't be replayed.
export async function invalidateEditToken(env, code) {
  await env.DB.prepare(
    "UPDATE profiles SET edit_token_hash=NULL, edit_token_expires_at=NULL WHERE code=?"
  )
    .bind(code)
    .run();
}
