# MyEmergencyInfo.net — profile app

Cloudflare Workers (with static assets) + D1. Serves the public, no-login
emergency profile pages, generates the QR code and on-demand PDF, and
handles the magic-link edit flow described in the technical spec.

*(Originally built on Cloudflare Pages, then converted to plain Workers —
Cloudflare has been folding Pages into Workers, and new accounts often
don't see a "Pages" option in the dashboard at all. Workers is now the
prominent, actively-developed path, and it does everything Pages did here.)*

## How this connects to GHL — and how to give Claude access

*(Revised: Claude's cloud workspace can't reach Cloudflare's servers
directly, even with an API token — that path was tested and doesn't work.
The plan below is what actually works, and it's also the option with the
least clicking for you.)*

You never need to hand over your GHL login, and this doesn't touch GoDaddy
at all anymore since the domain's DNS now lives in GHL's domain manager.
Two separate, small, one-time pieces of access are involved:

**1. A free GitHub account + one scoped token, so Claude can hand off the
code.** GitHub is just the delivery mechanism — Claude pushes the app's
code there, and Cloudflare watches that one repository and deploys
automatically every time it changes. See Step 1 below.

**2. A free Cloudflare account, set up entirely by clicking in their
dashboard** — connect it to that one GitHub repo, create the database, and
add two settings. No terminal, no command line, ever. See Step 2 below.
After this one-time setup, all future updates happen automatically when
Claude pushes new code — nothing further required from you.

**3. GHL's DNS editor.** No access needed at all — Claude gives you the
exact record to type in yourself (2 minutes, see Step 3 below).

If even the Cloudflare dashboard clicking feels like too much, it's
reasonable to have someone else do this one-time setup for you (a
tech-savvy friend, or a short paid task on a freelance site) — once it's
done, you won't need to touch it again.

---

## Step 1 — GitHub (Claude needs this to hand off the code)

1. Create a free account at **github.com/join** if you don't already have one.
2. Create a new **private** repository named `myemergencyinfo-app` (leave
   it empty — don't add a README or .gitignore, Claude will push
   everything).
3. Create a token scoped to only that repository:
   - Click your profile picture (top right) → **Settings**
   - Left sidebar, scroll to **Developer settings**
   - **Personal access tokens → Fine-grained tokens → Generate new token**
   - **Repository access:** "Only select repositories" → choose
     `myemergencyinfo-app`
   - **Permissions → Repository permissions → Contents:** Read and write
     (leave everything else as "No access")
   - Generate, copy the token, and paste it into the chat with Claude.
     This token can only touch that one repository — nothing else in your
     GitHub account — and you can revoke it anytime from the same screen.

## Step 2 — Cloudflare (all clicks, no terminal)

Cloudflare's dashboard has been changing — new accounts often land on a
plain "Workers" (sometimes labeled "Compute") view in the left sidebar,
without a separate "Pages" entry. Use that Workers path directly:

1. Create a free account at **cloudflare.com/sign-up**.
2. In the left sidebar, click **Workers** (or **Compute (Workers)**) →
   **Create application** (sometimes just "Create") → **Import a
   repository** (this is Cloudflare's Git-connected build feature —
   "Workers Builds"). Choose GitHub → authorize access, selecting **"Only
   select repositories"** → pick `myemergencyinfo-app`.
3. Cloudflare should auto-detect the settings from `wrangler.toml` in the
   repo (entry point, static assets folder). If it asks for a build
   command, leave it blank.
4. Create the database: in the left sidebar look for **Storage & Databases
   → D1** (older layouts: **Workers & Pages → D1**) → **Create database** →
   name it `myemergencyinfo`. Open its **Console** tab, paste in the
   contents of `schema.sql` from this project, and click **Execute**.
5. Back in the Worker's own settings page → **Bindings → Add binding →
   D1 database**: variable name `DB`, database = `myemergencyinfo`.
6. Same settings area → **Variables and Secrets → Add**, twice:
   - `PUBLIC_BASE_URL` = `https://id.myemergencyinfo.net`
   - `WEBHOOK_SECRET` = `538cd3cbeee7e0d067064e60506b2fcf51df72e6189905aa`
     (already generated for this project — use exactly this value here and
     in the GHL webhook header in Step 4, so they match)
7. Trigger a deployment if one hasn't run automatically (there's usually a
   "Deploy" or "Retry deployment" button once the bindings are saved).
   Cloudflare will show a project address like
   `myemergencyinfo-app.<your-subdomain>.workers.dev` — that confirms it's
   live; the custom domain in Step 3 is what actually gets used.
8. In the Worker's settings, find **Domains & Routes → Add → Custom
   domain** → enter `id.myemergencyinfo.net`.

## Step 3 — connect the subdomain in GHL

Once Step 2 is done, Cloudflare's "Custom domain" screen from step 8 above
will show you the exact CNAME target to use (or, if it provisions
automatically without needing one, it'll say so). In your GHL subaccount:

1. **Settings → Domains → Purchased Domains → Configure** (next to
   myemergencyinfo.net).
2. Add a new DNS record:
   - **Type:** CNAME
   - **Host/Name:** `id`
   - **Points to:** the exact value Cloudflare's custom domain screen
     gives you (Claude will confirm this once the Worker is deployed)
3. Save. This only creates the `id.` subdomain — it does not touch or move
   anything about the root `myemergencyinfo.net` domain, so your existing
   WordPress site is completely unaffected.
4. Cloudflare issues a valid SSL certificate automatically once it sees
   the CNAME, usually within a few minutes.
5. Test: visit `https://id.myemergencyinfo.net/e/TESTCODE` — you should see
   the "Profile not found" page (expected, since no real profile exists
   yet) with a valid padlock/HTTPS, confirming the connection works.

## Step 4 — the GHL side: form + workflow

(A plain-language, screen-share-friendly version of this step is in the
separate `GHL_Webhook_Setup.pdf` — that's the one to pull up on a call
with GHL support.)

1. Build the intake form with fields matching `schema.sql`.
2. Create a workflow, triggered on form submission, with a **Webhook**
   action:
   - URL: `https://id.myemergencyinfo.net/api/webhook-ghl`
   - Method: POST
   - Header: `x-webhook-secret: 538cd3cbeee7e0d067064e60506b2fcf51df72e6189905aa`
   - Body (JSON), mapping GHL merge fields into this shape:
     ```json
     {
       "ghl_contact_id": "{{contact.id}}",
       "full_name": "{{contact.full_name}}",
       "tier": "free",
       "emergency_contacts": [
         { "name": "{{contact.ec1_name}}", "relationship": "{{contact.ec1_relationship}}", "phone": "{{contact.ec1_phone}}" }
       ],
       "doctors": [],
       "medications": [],
       "conditions": [],
       "allergies": "{{contact.allergies}}",
       "blood_type": "{{contact.blood_type}}"
     }
     ```
3. Map the webhook's JSON **response** into custom fields (GHL supports
   this in the webhook action's response-mapping section) — specifically
   `profile_url`, `edit_url`, and `qr_png_data_url` — so the next workflow
   step (an email/SMS action) can merge those into the confirmation message
   sent to the customer.

That confirmation message is what delivers the permanent link and QR code
to the customer for the first time — and the same `edit_url` mechanism is
what lets them update their info later without ever needing a password.
