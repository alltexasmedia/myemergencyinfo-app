import { upsertProfileFromWebhook, issueEditToken, getProfileByCode, getProfileByValidEditToken, updateProfileFields, invalidateEditToken } from "./lib/db.js";
import { generateQrSvg, generateQrPngDataUrl } from "./lib/qr.js";
import { generateProfilePdf } from "./lib/pdf.js";
import { renderProfileHtml, renderEditFormHtml } from "./lib/render.js";

// Single Workers entry point (replaces the old Pages Functions folder
// convention). Cloudflare's dashboard now leads new accounts to plain
// Workers with a Git-connected build, so this matches that path directly
// instead of requiring the "hidden" classic Pages flow.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}

async function handleWebhook(request, env) {
  const secret = request.headers.get("x-webhook-secret");
  if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  if (!payload.ghl_contact_id) {
    return json({ error: "ghl_contact_id is required" }, 400);
  }

  const { code, isNew } = await upsertProfileFromWebhook(env, payload);
  const profileUrl = `${env.PUBLIC_BASE_URL}/e/${code}`;
  const { token, expiresAt } = await issueEditToken(env, code);
  const editUrl = `${env.PUBLIC_BASE_URL}/edit/${token}`;
  const qrSvg = await generateQrSvg(profileUrl);
  const qrPngDataUrl = await generateQrPngDataUrl(profileUrl);

  return json({
    code,
    is_new_profile: isNew,
    profile_url: profileUrl,
    edit_url: editUrl,
    edit_link_expires_at: expiresAt,
    qr_svg: qrSvg,
    qr_png_data_url: qrPngDataUrl,
  });
}

async function handleProfilePage(code, env) {
  const profile = await getProfileByCode(env, code);
  const profileUrl = `${env.PUBLIC_BASE_URL}/e/${code}`;
  return html(renderProfileHtml(profile, { profileUrl }), profile ? 200 : 404);
}

async function handleProfilePdf(code, env) {
  const profile = await getProfileByCode(env, code);
  if (!profile) return new Response("Profile not found", { status: 404 });
  const profileUrl = `${env.PUBLIC_BASE_URL}/e/${code}`;
  const pdfBytes = await generateProfilePdf(profile, profileUrl);
  return new Response(pdfBytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${code}-emergency-info.pdf"`,
    },
  });
}

function expiredHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link expired</title></head>
  <body style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 16px;">
  <h1>This edit link has expired</h1>
  <p>Edit links are single-use and expire after 48 hours for security.
  Request a new one from your account, and it'll be emailed to you.</p>
  </body></html>`;
}

async function handleEditGet(token, env) {
  const profile = await getProfileByValidEditToken(env, token);
  if (!profile) return html(expiredHtml(), 410);
  return html(renderEditFormHtml(profile, token));
}

async function handleEditPost(token, env, request) {
  const profile = await getProfileByValidEditToken(env, token);
  if (!profile) return html(expiredHtml(), 410);

  const form = await request.formData();
  const names = form.getAll("ec_name[]");
  const rels = form.getAll("ec_rel[]");
  const phones = form.getAll("ec_phone[]");
  const emergency_contacts = names
    .map((name, i) => ({ name, relationship: rels[i], phone: phones[i] }))
    .filter((c) => c.name || c.phone);

  const fields = {
    full_name: form.get("full_name") || "",
    emergency_contacts,
    doctors: profile.doctors,
    medications: profile.medications,
    conditions: (form.get("conditions") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    allergies: form.get("allergies") || "",
    blood_type: form.get("blood_type") || "",
  };

  await updateProfileFields(env, profile.code, fields);
  await invalidateEditToken(env, profile.code);

  const updated = { ...profile, ...fields };
  return html(renderEditFormHtml(updated, token, { saved: true }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/webhook-ghl" && method === "POST") {
        return await handleWebhook(request, env);
      }

      let m;
      if ((m = path.match(/^\/e\/([^/]+)\/pdf$/)) && method === "GET") {
        return await handleProfilePdf(decodeURIComponent(m[1]), env);
      }
      if ((m = path.match(/^\/e\/([^/]+)$/)) && method === "GET") {
        return await handleProfilePage(decodeURIComponent(m[1]), env);
      }
      if ((m = path.match(/^\/edit\/([^/]+)$/))) {
        if (method === "GET") return await handleEditGet(decodeURIComponent(m[1]), env);
        if (method === "POST") return await handleEditPost(decodeURIComponent(m[1]), env, request);
      }

      // Static assets (robots.txt, etc.) fall through to the ASSETS binding.
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ error: "internal_error", message: String(err) }, 500);
    }
  },
};
