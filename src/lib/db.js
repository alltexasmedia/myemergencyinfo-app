import { generateCode, generateEditToken, hashToken } from "./codegen.js";

const EDIT_TOKEN_TTL_SECONDS = 60 * 60 * 48; // 48 hours — free tier's one-shot link
// Paid tiers advertise "update anytime," and a fresh link is issued on every
// save anyway — but the very first link (from the signup confirmation email)
// needs to survive until the customer's first edit, whenever that is. A long
// TTL here is what makes "anytime" actually true instead of a 48-hour window.
const PAID_EDIT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// emergency_contacts / doctors / medications are stored as plain free-form
// text (one entry per line, typed by the customer) — not JSON. Only
// `conditions` is still a small JSON array of strings, since that one
// renders as individual pill/flag badges on the page.
function parseJsonColumns(row) {
  if (!row) return row;
  return {
    ...row,
    conditions: safeParse(row.conditions, []),
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

// Turns the comma-separated "conditions" text (from either the GHL webhook
// or the self-service edit form) into a clean array of strings for storage.
export function splitConditions(text) {
  return String(text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    emergency_contacts: String(payload.emergency_contacts ?? ""),
    doctors: String(payload.doctors ?? ""),
    medications: String(payload.medications ?? ""),
    conditions: JSON.stringify(splitConditions(payload.conditions)),
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
export async function issueEditToken(env, code, tier = "free") {
  const token = generateEditToken();
  const hash = await hashToken(token);
  const ttl = isPaidTier(tier) ? PAID_EDIT_TOKEN_TTL_SECONDS : EDIT_TOKEN_TTL_SECONDS;
  const expiresAt = nowSeconds() + ttl;
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
      String(fields.emergency_contacts ?? ""),
      String(fields.doctors ?? ""),
      String(fields.medications ?? ""),
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

// Paid tiers get unlimited self-service edits, marketed as "update your
// info anytime." Free tier's edit link is single-use, which is the
// upgrade hook. Keep this list in sync with the tiers offered at signup.
const PAID_TIERS = new Set(["essential", "ultimate"]);

export function isPaidTier(tier) {
  return PAID_TIERS.has(tier);
}
