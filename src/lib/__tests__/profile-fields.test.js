// Regression tests for the profile data pipeline: D1 row -> parseJsonColumns
// -> renderProfileHtml / renderEditFormHtml.
//
// WHY THIS FILE EXISTS (2026-09-02): emergency_contacts/doctors/medications
// showed up as the literal text "[object Object]" on a real, correctly
// filled-out live profile. Root cause: db.js's read-time normalizer wrapped
// stored text into a single-object array, but every actual consumer
// (render.js's profile page, its edit-form textareas, tiers.js's line
// limits) has always expected a plain multi-line string. No test existed
// that would have caught this before it shipped — this file is that test.
//
// Run with: npm test  (uses Node's built-in test runner, no dependencies)
//
// These tests exercise the REAL functions from db.js/render.js/tiers.js —
// not reimplementations of them — so a future change to any of those files
// gets checked against this, not against a copy that can drift out of sync.

import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonColumns, splitConditions } from "../db.js";
import { renderProfileHtml, renderEditFormHtml } from "../render.js";
import { visibleLines } from "../tiers.js";

// Mirrors exactly how db.js's write path stores these fields today
// (JSON.stringify of the raw string that came from the webhook payload or
// the edit form's <textarea>). Used to build realistic fake D1 rows.
function storedAsD1Would(value) {
  return JSON.stringify(value);
}

function baseRow(overrides = {}) {
  return {
    code: "testcode",
    tier: "ultimate",
    full_name: "Mark Robbins",
    emergency_contacts: storedAsD1Would("Sarah Robbins (spouse) - 555-123-4567\nJames Robbins (son) - 555-987-6543"),
    doctors: storedAsD1Would("Dr. Alice Chen, Endocrinology - 555-222-3333"),
    medications: storedAsD1Would("Metformin 500mg twice daily\nInsulin glargine 20 units at bedtime"),
    conditions: storedAsD1Would(["Diabetic - First diagnosed with Diabetes 9/3/2008"]),
    allergies: "Seasonal (grasses, mold)",
    blood_type: "AB-",
    updated_at: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// Any string handed to a person should never contain this literal text —
// it's the fingerprint of an object getting stringified by accident
// instead of its real field(s) being extracted first.
function assertNoObjectObject(value, label) {
  assert.ok(
    !String(value).includes("[object Object]"),
    `${label} contains the literal text "[object Object]" — a shape mismatch bug, same as the 2026-09-02 incident`
  );
}

test("parseJsonColumns: normal multi-line contact/doctor/medication text round-trips as plain strings", () => {
  const row = baseRow();
  const profile = parseJsonColumns(row);

  assert.equal(typeof profile.emergency_contacts, "string");
  assert.equal(typeof profile.doctors, "string");
  assert.equal(typeof profile.medications, "string");
  assert.ok(Array.isArray(profile.conditions));

  assert.match(profile.emergency_contacts, /Sarah Robbins/);
  assert.match(profile.emergency_contacts, /James Robbins/);
  assert.match(profile.doctors, /Dr\. Alice Chen/);
  assert.match(profile.medications, /Metformin/);
  assert.match(profile.medications, /Insulin glargine/);

  for (const field of ["emergency_contacts", "doctors", "medications"]) {
    assertNoObjectObject(profile[field], `parseJsonColumns().${field}`);
  }
});

test("parseJsonColumns: empty/missing fields never produce [object Object] or throw", () => {
  const row = baseRow({
    emergency_contacts: null,
    doctors: undefined,
    medications: storedAsD1Would(""),
    conditions: null,
  });
  const profile = parseJsonColumns(row);

  assert.equal(profile.emergency_contacts, "");
  assert.equal(profile.doctors, "");
  assert.equal(profile.medications, "");
  assert.deepEqual(profile.conditions, []);
});

test("parseJsonColumns: legacy array-of-objects data (from the broken period) degrades gracefully instead of showing [object Object]", () => {
  // This is the exact bad shape the old, buggy normalizer used to produce.
  // Simulates a row that somehow still has this shape stored (e.g. if it
  // was ever re-saved while the bug was live) — the fix should flatten it
  // back to readable text via .name rather than blowing up or displaying
  // the object literally.
  const row = baseRow({
    emergency_contacts: storedAsD1Would([{ name: "Sarah Robbins (spouse) - 555-123-4567" }]),
  });
  const profile = parseJsonColumns(row);

  assert.equal(typeof profile.emergency_contacts, "string");
  assert.match(profile.emergency_contacts, /Sarah Robbins/);
  assertNoObjectObject(profile.emergency_contacts, "parseJsonColumns().emergency_contacts (legacy shape)");
});

test("parseJsonColumns: a row where a field was literally overwritten with the text \"[object Object]\" is passed through as-is (data corruption, not a rendering bug — this test documents that this case can't be auto-recovered)", () => {
  const row = baseRow({ emergency_contacts: storedAsD1Would("[object Object]") });
  const profile = parseJsonColumns(row);
  // We can't distinguish "the user's real data happens to be this string"
  // from "this got corrupted" — this is why the real fix for that scenario
  // is re-entering the data, not code. This test just documents the
  // boundary so it doesn't get mistaken for a live bug again in the future.
  assert.equal(profile.emergency_contacts, "[object Object]");
});

test("renderProfileHtml: real profile data reaches the actual page HTML, with tap-to-call links, and no [object Object] anywhere in the output", () => {
  const profile = parseJsonColumns(baseRow());
  const htmlOut = renderProfileHtml(profile, { profileUrl: "https://myemergencyinfo.net/e/testcode" });

  assertNoObjectObject(htmlOut, "renderProfileHtml output");
  assert.match(htmlOut, /Sarah Robbins/);
  assert.match(htmlOut, /James Robbins/);
  assert.match(htmlOut, /Dr\. Alice Chen/);
  assert.match(htmlOut, /Metformin/);
  assert.match(htmlOut, /tel:5551234567/);
  assert.match(htmlOut, /tel:5559876543/);
  assert.match(htmlOut, /Diabetic/);
});

test("renderEditFormHtml: the edit form's textareas contain real editable text, not [object Object]", () => {
  const profile = parseJsonColumns(baseRow());
  const htmlOut = renderEditFormHtml(profile, "faketoken", {});

  assertNoObjectObject(htmlOut, "renderEditFormHtml output");

  const contactsBox = htmlOut.match(/<textarea name="emergency_contacts">([\s\S]*?)<\/textarea>/);
  assert.ok(contactsBox, "emergency_contacts textarea should be present");
  assert.match(contactsBox[1], /Sarah Robbins/);
  assert.match(contactsBox[1], /James Robbins/);

  const doctorsBox = htmlOut.match(/<textarea name="doctors">([\s\S]*?)<\/textarea>/);
  assert.match(doctorsBox[1], /Dr\. Alice Chen/);
});

test("visibleLines: plain multi-line text (the real shape) splits into the correct number of lines per tier", () => {
  const profile = parseJsonColumns(baseRow());
  const { shown } = visibleLines(profile.emergency_contacts, "ultimate", "emergency_contacts");
  assert.equal(shown.length, 2);
  assert.equal(shown[0], "Sarah Robbins (spouse) - 555-123-4567");
  assert.equal(shown[1], "James Robbins (son) - 555-987-6543");
});

test("splitConditions: comma-separated text becomes a clean array of strings", () => {
  const result = splitConditions("Diabetic (Type 1), Peanut allergy,  Asthma ");
  assert.deepEqual(result, ["Diabetic (Type 1)", "Peanut allergy", "Asthma"]);
});

