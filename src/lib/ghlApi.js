// GHL doesn't reliably resolve "Multi line" custom fields as merge tags
// inside a Webhook action's Custom Data — confirmed by direct testing:
// Single line fields (Blood Type, Allergies, Conditions) merge correctly,
// but Multi line fields (Emergency Contacts, Doctors, Medications) come
// through empty every time, regardless of timing. This sidesteps GHL's
// merge-tag engine entirely for those three fields by asking GHL's API
// directly for the contact's real, current custom field values.
//
// API reference (confirmed live, not guessed): a contact's customFields
// come back as [{ id, key, fieldValue }], so we can match by the plain
// field key without any separate field-ID lookup step.
const GHL_API_BASE = "https://services.leadconnectorhq.com";

const FIELD_KEY_CANDIDATES = {
  emergency_contacts: ["emergency_contacts", "contact.emergency_contacts"],
  doctors: ["doctors", "contact.doctors"],
  medications: ["medications", "contact.medications"],
};

// Returns { emergency_contacts, doctors, medications } with each value
// either a string (found) or null (not found / lookup unavailable) — never
// throws, so a GHL API hiccup can't break profile creation or the email.
export async function fetchMultilineFieldsFromGhl(env, contactId) {
  if (!env.GHL_API_KEY || !contactId) return null;

  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
      headers: {
        Authorization: `Bearer ${env.GHL_API_KEY}`,
        Version: "v3",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error("GHL contact fetch failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const customFields = data?.contact?.customFields || [];

    const findValue = (candidates) => {
      const match = customFields.find((f) =>
        candidates.some((c) => (f.key || "").toLowerCase() === c.toLowerCase())
      );
      return match ? String(match.fieldValue ?? match.value ?? "") : null;
    };

    return {
      emergency_contacts: findValue(FIELD_KEY_CANDIDATES.emergency_contacts),
      doctors: findValue(FIELD_KEY_CANDIDATES.doctors),
      medications: findValue(FIELD_KEY_CANDIDATES.medications),
    };
  } catch (err) {
    console.error("GHL API contact fetch error:", err);
    return null;
  }
}
