function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const BASE_STYLE = `
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f6f9;
    color:#1f2430;margin:0;padding:0;}
  .wrap{max-width:480px;margin:0 auto;padding:20px 16px 60px;}
  .card{background:#fff;border-radius:12px;padding:20px;margin-bottom:14px;
    box-shadow:0 1px 3px rgba(0,0,0,0.08);}
  h1{font-size:20px;margin:0 0 2px;color:#1a2b4c;}
  .updated{font-size:12px;color:#8a94a1;margin-bottom:18px;}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#55606e;
    font-weight:700;margin-bottom:8px;}
  .flag{display:inline-block;background:#fde8e8;color:#a12727;font-weight:700;
    padding:6px 12px;border-radius:6px;font-size:14px;margin-bottom:4px;}
  .row{padding:8px 0;border-bottom:1px solid #eef1f6;}
  .row:last-child{border-bottom:none;}
  .name{font-weight:700;}
  .sub{color:#55606e;font-size:13px;}
  a.tel{color:#1a2b4c;text-decoration:none;font-weight:700;}
  .btn{display:block;text-align:center;background:#1a2b4c;color:#fff;padding:12px;
    border-radius:8px;text-decoration:none;font-weight:700;margin-top:10px;}
  .empty{color:#8a94a1;font-size:13px;font-style:italic;}
`;

export function renderProfileHtml(profile, { profileUrl }) {
  if (!profile) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Profile not found</title><style>${BASE_STYLE}</style></head>
    <body><div class="wrap"><div class="card"><h1>Profile not found</h1>
    <p class="sub">This emergency-info link doesn't match an active profile.</p>
    </div></div></body></html>`;
  }

  const updated = new Date(profile.updated_at * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  const contactsHtml = profile.emergency_contacts?.length
    ? profile.emergency_contacts.map((c) => `
        <div class="row"><span class="name">${esc(c.name)}</span>
        <span class="sub"> — ${esc(c.relationship)}</span><br>
        <a class="tel" href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>`).join("")
    : `<p class="empty">No emergency contacts on file.</p>`;

  const doctorsHtml = profile.doctors?.length
    ? profile.doctors.map((d) => `
        <div class="row"><span class="name">${esc(d.name)}</span>
        <span class="sub"> — ${esc(d.specialty)}</span><br>
        <a class="tel" href="tel:${esc(d.phone)}">${esc(d.phone)}</a></div>`).join("")
    : `<p class="empty">No doctors on file.</p>`;

  const medsHtml = profile.medications?.length
    ? profile.medications.map((m) => `
        <div class="row"><span class="name">${esc(m.name)}</span>
        ${m.dosage ? `<span class="sub"> — ${esc(m.dosage)}</span>` : ""}
        ${m.frequency ? `<div class="sub">${esc(m.frequency)}</div>` : ""}</div>`).join("")
    : `<p class="empty">No medications on file.</p>`;

  const conditionsHtml = profile.conditions?.length
    ? profile.conditions.map((c) => `<span class="flag">${esc(c)}</span>`).join(" ")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(profile.full_name || "Emergency Info")} — Emergency Info</title>
  <style>${BASE_STYLE}</style></head>
  <body><div class="wrap">
    <div class="card">
      <h1>${esc(profile.full_name || "Emergency Info")}</h1>
      <div class="updated">Last updated ${updated}</div>
      ${conditionsHtml ? `<div>${conditionsHtml}</div>` : ""}
      ${profile.blood_type ? `<div class="sub" style="margin-top:8px;">Blood type: ${esc(profile.blood_type)}</div>` : ""}
      ${profile.allergies ? `<div class="sub">Allergies: ${esc(profile.allergies)}</div>` : ""}
    </div>
    <div class="card">
      <div class="label">Emergency Contacts</div>
      ${contactsHtml}
    </div>
    <div class="card">
      <div class="label">Doctors</div>
      ${doctorsHtml}
    </div>
    <div class="card">
      <div class="label">Medications</div>
      ${medsHtml}
    </div>
    <a class="btn" href="${esc(profileUrl)}/pdf">Download PDF</a>
  </div></body></html>`;
}

export function renderEditFormHtml(profile, token, { saved = false, error = null } = {}) {
  const contactsRows = (profile.emergency_contacts?.length ? profile.emergency_contacts : [{}])
    .map((c) => `<div class="row3">
      <input name="ec_name[]" placeholder="Name" value="${esc(c.name)}">
      <input name="ec_rel[]" placeholder="Relationship" value="${esc(c.relationship)}">
      <input name="ec_phone[]" placeholder="Phone" value="${esc(c.phone)}"></div>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Update your emergency info</title>
  <style>${BASE_STYLE}
    input,textarea{width:100%;box-sizing:border-box;padding:9px;margin:4px 0;
      border:1px solid #cfd6de;border-radius:6px;font-size:14px;}
    .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;}
    label{font-size:12px;color:#55606e;font-weight:700;}
  </style></head>
  <body><div class="wrap">
    <div class="card">
      <h1>Update your emergency info</h1>
      <div class="sub">Changes save immediately. Your link and QR code never change.</div>
    </div>
    ${saved ? `<div class="card"><strong>Saved.</strong> Your public page is now up to date.</div>` : ""}
    ${error ? `<div class="card" style="color:#a12727;">${esc(error)}</div>` : ""}
    <form method="POST" class="card">
      <label>Full name</label>
      <input name="full_name" value="${esc(profile.full_name)}">
      <label>Emergency contacts</label>
      ${contactsRows}
      <label>Blood type</label>
      <input name="blood_type" value="${esc(profile.blood_type)}">
      <label>Allergies</label>
      <input name="allergies" value="${esc(profile.allergies)}">
      <label>Conditions (comma-separated)</label>
      <input name="conditions" value="${esc((profile.conditions || []).join(", "))}">
      <button class="btn" type="submit" style="border:none;width:100%;">Save changes</button>
    </form>
  </div></body></html>`;
}
