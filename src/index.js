import { upsertProfileFromWebhook, issueEditToken, getProfileByCode, getProfileByValidEditToken, updateProfileFields, invalidateEditToken, isPaidTier, splitConditions } from "./lib/db.js";
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

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// GHL's webhook action can't pass its own response (this app's reply) into
// a later email step — confirmed dead end, no response-mapping feature in
// this account's builder. So the app sends the confirmation itself, via
// Resend, the moment it creates/updates the profile. Never throws — a
// failed email should not break profile creation, since the customer can
// still be shown the failure) or the info can be resent by hand.
async function sendConfirmationEmail(env, { to, fullName, profileUrl, editUrl, qrPngDataUrl, tier }) {
  if (!env.RESEND_API_KEY) return; // not configured yet — skip quietly rather than fail the webhook

  const fromAddress = env.EMAIL_FROM || "My Emergency Info <hello@mail.myemergencyinfo.net>";
  const qrBase64 = qrPngDataUrl.split(",")[1];
  const greetingName = fullName ? `, ${escHtml(fullName)}` : "";

  const upgradeNote = isPaidTier(tier)
    ? `<p>Your plan includes <strong>unlimited updates</strong> — use the secure link below anytime your info changes, and you'll always get a fresh one back after you save.</p>`
    : `<p>On the free plan, the update link below works <strong>once</strong>. Upgrading to Essential or Ultimate gets you a link that always stays active, plus room to list more emergency contacts, doctors, and medications on your page.</p>`;

  // Self-service cancellation via Stripe's own hosted "customer portal" —
  // a single shareable link (same for everyone) where a customer enters
  // their email, Stripe emails *them* a one-time login link, and they land
  // on a page where they can cancel or manage their subscription with zero
  // involvement from us. Only shown to paid tiers, since free has nothing
  // to cancel. Set STRIPE_PORTAL_URL once the portal is activated in the
  // Stripe Dashboard (Settings -> Billing -> Customer portal).
  const cancelNote =
    isPaidTier(tier) && env.STRIPE_PORTAL_URL
      ? `<p>Need to cancel or manage your subscription? You can do that anytime, on your own, here: <a href="${escHtml(env.STRIPE_PORTAL_URL)}">${escHtml(env.STRIPE_PORTAL_URL)}</a></p>`
      : "";

  const bodyHtml = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2430;">
      <h2 style="color:#1a2b4c;">Your Emergency Info page is ready${greetingName}</h2>
      <p>Here's your permanent emergency-info link — save it, print it, or scan the attached QR code:</p>
      <p><a href="${escHtml(profileUrl)}" style="color:#1a2b4c;font-weight:bold;">${escHtml(profileUrl)}</a></p>
      <p><a href="${escHtml(profileUrl)}/pdf" style="color:#1a2b4c;">Download a printable wallet/glovebox card (PDF)</a></p>
      ${upgradeNote}
      <p>To update your info, use this secure link: <a href="${escHtml(editUrl)}">${escHtml(editUrl)}</a></p>
      ${cancelNote}
    </div>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: "Your Emergency Info page is ready",
        html: bodyHtml,
        attachments: [{ filename: "emergency-info-qr.png", content: qrBase64 }],
      }),
    });
  } catch {
    // Swallow errors — a broken email send should never take down profile
    // creation. Worth revisiting with real logging once there's volume.
  }
}

async function handleWebhook(request, env, ctx) {
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

  if (!payload.email) {
    return json({ error: "email is required" }, 400);
  }

  // GHL's Webhook action nests every manually-configured "Custom Data"
  // key/value pair inside a `customData` object in the outgoing JSON body —
  // it does NOT flatten them onto the root. Only GHL's own "standard
  // fields" (email, full_name, contact_id, etc.) land at the root
  // automatically. Confirmed directly from a raw payload dump on
  // 2026-08-20: emergency_contacts/doctors/medications/conditions/
  // allergies/blood_type/tier were all sitting under payload.customData,
  // which is why they showed up blank downstream — nothing to do with
  // "Multi line" fields not merging (that theory was wrong).
  if (payload.customData && typeof payload.customData === "object") {
    payload = { ...payload, ...payload.customData };
  }

  const { code, isNew } = await upsertProfileFromWebhook(env, payload);
  const profileUrl = `${env.PUBLIC_BASE_URL}/e/${code}`;
  const { token, expiresAt } = await issueEditToken(env, code, payload.tier ?? "free");
  const editUrl = `${env.PUBLIC_BASE_URL}/edit/${token}`;
  const qrSvg = await generateQrSvg(profileUrl);
  const qrPngDataUrl = await generateQrPngDataUrl(profileUrl);

  // Fire-and-forget: don't make GHL's webhook step wait on email delivery.
  ctx.waitUntil(
    sendConfirmationEmail(env, {
      to: payload.email,
      fullName: payload.full_name,
      profileUrl,
      editUrl,
      qrPngDataUrl,
      tier: payload.tier ?? "free",
    })
  );

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
  <p>This link is no longer active — either it already expired, or (if you're
  on a paid plan) a newer link was issued the last time you saved changes.
  Check your most recent confirmation for the current link, or contact us
  for a new one.</p>
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
  const fields = {
    full_name: form.get("full_name") || "",
    emergency_contacts: form.get("emergency_contacts") || "",
    doctors: form.get("doctors") || "",
    medications: form.get("medications") || "",
    conditions: splitConditions(form.get("conditions")),
    allergies: form.get("allergies") || "",
    blood_type: form.get("blood_type") || "",
  };

  await updateProfileFields(env, profile.code, fields);

  const updated = { ...profile, ...fields };

  if (isPaidTier(profile.tier)) {
    // Unlimited edits for paid tiers: this save also issues a brand-new
    // link (which overwrites/invalidates the one just used), and we show
    // it on the confirmation page so the customer can keep using it.
    const { token: newToken, expiresAt } = await issueEditToken(env, profile.code, profile.tier);
    const newEditUrl = `${env.PUBLIC_BASE_URL}/edit/${newToken}`;
    return html(
      renderEditFormHtml(updated, newToken, {
        saved: true,
        newEditUrl,
        newEditExpiresAt: expiresAt,
        tier: profile.tier,
      })
    );
  }

  // Free tier: single-use, as before — this is the upgrade hook.
  await invalidateEditToken(env, profile.code);
  return html(renderEditFormHtml(updated, token, { saved: true, tier: profile.tier }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/webhook-ghl" && method === "POST") {
        return await handleWebhook(request, env, ctx);
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
