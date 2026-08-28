import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { generateQrPngDataUrl } from "./qr.js";

// A real wallet-sized card — standard business/credit-card footprint —
// instead of a full letter-size document. Two pages: front (identity +
// critical vitals + QR) and back (emergency contacts/doctors/medications),
// meant to be printed double-sided and trimmed to size, the way a real
// medical-alert card works. At print time the PDF viewer/printer must be
// set to "Actual size" (not "Fit to page"), otherwise it'll get scaled up.
const CARD_WIDTH = 252; // 3.5in
const CARD_HEIGHT = 144; // 2in
const MARGIN = 9;
const NAVY = rgb(0.1, 0.17, 0.3);
const GRAY = rgb(0.4, 0.43, 0.47);
const BLACK = rgb(0, 0, 0);

// pdf-lib doesn't wrap text for you — at card width that's required, so
// this greedily breaks `text` into lines no wider than `maxWidth`.
function wrapText(text, font, size, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatContact(c) {
  const rel = c.relationship ? ` (${c.relationship})` : "";
  const phone = c.phone ? ` — ${c.phone}` : "";
  return `${c.name || ""}${rel}${phone}`;
}

function formatDoctor(d) {
  const specialty = d.specialty ? `, ${d.specialty}` : "";
  const phone = d.phone ? ` — ${d.phone}` : "";
  return `${d.name || ""}${specialty}${phone}`;
}

function formatMedication(m) {
  const dosage = m.dosage ? ` — ${m.dosage}` : "";
  const freq = m.frequency ? ` (${m.frequency})` : "";
  return `${m.name || ""}${dosage}${freq}`;
}

// Draws a labeled section (e.g. "EMERGENCY CONTACTS") with wrapped body
// lines, stopping cleanly and noting "+N more" if it would run off the
// bottom of the card rather than overflowing the page.
function drawSection(page, font, bold, { label, items, x, maxWidth, y, minY, lineGap = 8.5 }) {
  if (!items.length) return y;
  if (y - 7 < minY) return y;

  page.drawText(label, { x, y, size: 6, font: bold, color: GRAY });
  y -= 9;

  for (let i = 0; i < items.length; i++) {
    const lines = wrapText(items[i], font, 7, maxWidth);
    for (const line of lines) {
      if (y - lineGap < minY) {
        const remaining = items.length - i;
        if (remaining > 0) {
          page.drawText(`+ ${remaining} more — see full profile online`, {
            x,
            y,
            size: 6,
            font,
            color: GRAY,
          });
          y -= lineGap;
        }
        return y;
      }
      page.drawText(line, { x, y, size: 7, font, color: BLACK });
      y -= lineGap;
    }
  }
  y -= 3;
  return y;
}

export async function generateProfilePdf(profile, profileUrl) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // ---- Front: identity, vitals, QR ----
  const front = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  const qrSize = 55;
  const qrX = CARD_WIDTH - MARGIN - qrSize;
  const qrY = MARGIN;
  const textMaxWidth = CARD_WIDTH - MARGIN * 2; // full width above the QR row
  const sideMaxWidth = qrX - MARGIN - 6; // narrower once text runs beside the QR

  let y = CARD_HEIGHT - MARGIN - 4;
  front.drawText("EMERGENCY MEDICAL INFO", { x: MARGIN, y, size: 6, font: bold, color: NAVY });
  y -= 12;
  front.drawText(profile.full_name || "Name not provided", { x: MARGIN, y, size: 12, font: bold, color: BLACK });
  y -= 13;

  const vitals = [
    profile.blood_type ? `Blood type: ${profile.blood_type}` : null,
    profile.allergies ? `Allergies: ${profile.allergies}` : null,
  ].filter(Boolean);
  for (const v of vitals) {
    for (const line of wrapText(v, font, 7, textMaxWidth)) {
      if (y - 8.5 < qrY + qrSize) break;
      front.drawText(line, { x: MARGIN, y, size: 7, font, color: BLACK });
      y -= 8.5;
    }
  }

  if (profile.conditions?.length) {
    y -= 2;
    front.drawText("CONDITIONS", { x: MARGIN, y, size: 6, font: bold, color: GRAY });
    y -= 9;
    const conditionsText = profile.conditions.join(", ");

    // If it fits above the QR's top edge at full width, use the full
    // width. Otherwise re-wrap once at the narrower (QR-clearing) width so
    // every line uses a single consistent measure rather than mixing the
    // two mid-paragraph.
    const fullWidthLines = wrapText(conditionsText, font, 7, textMaxWidth);
    const linesAboveQr = Math.max(0, Math.floor((y - (qrY + qrSize)) / 8.5));
    const lines =
      fullWidthLines.length <= linesAboveQr
        ? fullWidthLines
        : wrapText(conditionsText, font, 7, sideMaxWidth);

    for (let i = 0; i < lines.length; i++) {
      if (y - 8.5 < MARGIN) {
        front.drawText(`+ ${lines.length - i} more line(s) — see full profile online`, {
          x: MARGIN,
          y,
          size: 5.5,
          font,
          color: GRAY,
        });
        break;
      }
      front.drawText(lines[i], { x: MARGIN, y, size: 7, font, color: BLACK });
      y -= 8.5;
    }
  }

  try {
    const qrDataUrl = await generateQrPngDataUrl(profileUrl);
    const qrImageBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const qrImage = await doc.embedPng(qrImageBytes);
    front.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  } catch {
    // If QR embedding fails, the card still renders with the URL text below.
  }

  front.drawText(profileUrl.replace(/^https?:\/\//, ""), {
    x: MARGIN,
    y: MARGIN,
    size: 5,
    font,
    color: GRAY,
  });
  front.drawText(`Updated ${new Date(profile.updated_at * 1000).toLocaleDateString()}`, {
    x: MARGIN,
    y: MARGIN + 7,
    size: 5,
    font,
    color: GRAY,
  });

  // ---- Back: contacts, doctors, medications ----
  const back = doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  let by = CARD_HEIGHT - MARGIN - 4;
  const minY = MARGIN + 6;
  const backMaxWidth = CARD_WIDTH - MARGIN * 2;

  by = drawSection(back, font, bold, {
    label: "EMERGENCY CONTACTS",
    items: (profile.emergency_contacts || []).map(formatContact),
    x: MARGIN,
    maxWidth: backMaxWidth,
    y: by,
    minY,
  });
  by = drawSection(back, font, bold, {
    label: "DOCTORS",
    items: (profile.doctors || []).map(formatDoctor),
    x: MARGIN,
    maxWidth: backMaxWidth,
    y: by,
    minY,
  });
  drawSection(back, font, bold, {
    label: "MEDICATIONS",
    items: (profile.medications || []).map(formatMedication),
    x: MARGIN,
    maxWidth: backMaxWidth,
    y: by,
    minY,
  });

  back.drawText("Full details: " + profileUrl.replace(/^https?:\/\//, ""), {
    x: MARGIN,
    y: MARGIN,
    size: 5,
    font,
    color: GRAY,
  });

  return doc.save();
}
