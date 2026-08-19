import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { generateQrPngDataUrl } from "./qr.js";
import { visibleLines } from "./tiers.js";

// Builds a one-page wallet/glovebox card PDF from the same live record that
// powers the public page, so the two are always in sync. Regenerated fresh
// on every request — nothing is cached to a static file.
export async function generateProfilePdf(profile, profileUrl) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([396, 612]); // 5.5in x 8.5in — half-letter card
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 28;
  let y = 612 - margin;
  const navy = rgb(0.1, 0.17, 0.3);
  const gray = rgb(0.35, 0.38, 0.42);

  const drawLine = (text, { size = 10, f = font, color = rgb(0, 0, 0), gap = 14 } = {}) => {
    page.drawText(text, { x: margin, y, size, font: f, color });
    y -= gap;
  };

  drawLine("EMERGENCY MEDICAL INFORMATION", { size: 13, f: bold, color: navy, gap: 20 });
  drawLine(profile.full_name || "Name not provided", { size: 15, f: bold, gap: 22 });

  if (profile.conditions?.length) {
    drawLine("MEDICAL CONDITIONS", { size: 9, f: bold, color: gray, gap: 12 });
    profile.conditions.forEach((c) => drawLine(`- ${c}`, { size: 10 }));
    y -= 6;
  }

  if (profile.blood_type) {
    drawLine(`Blood type: ${profile.blood_type}`, { size: 10, gap: 16 });
  }
  if (profile.allergies) {
    drawLine(`Allergies: ${profile.allergies}`, { size: 10, gap: 16 });
  }

  // Contacts/doctors/medications are typed as free-form text (one entry per
  // line). Only show what this profile's tier is allowed to — the same
  // limits the public page enforces — so the PDF can't be used to bypass
  // the paywall.
  const drawUpsell = (count) =>
    drawLine(`+ ${count} more on file — upgrade to include ${count === 1 ? "it" : "them"} here.`, {
      size: 8, color: gray,
    });

  const contacts = visibleLines(profile.emergency_contacts, profile.tier, "emergency_contacts");
  if (contacts.shown.length) {
    y -= 4;
    drawLine("EMERGENCY CONTACTS", { size: 9, f: bold, color: gray, gap: 12 });
    contacts.shown.forEach((line) => drawLine(line, { size: 10 }));
    if (contacts.hiddenCount > 0) drawUpsell(contacts.hiddenCount);
    y -= 6;
  }

  const doctors = visibleLines(profile.doctors, profile.tier, "doctors");
  if (doctors.shown.length) {
    drawLine("DOCTORS", { size: 9, f: bold, color: gray, gap: 12 });
    doctors.shown.forEach((line) => drawLine(line, { size: 10 }));
    if (doctors.hiddenCount > 0) drawUpsell(doctors.hiddenCount);
    y -= 6;
  }

  const medications = visibleLines(profile.medications, profile.tier, "medications");
  if (medications.shown.length) {
    drawLine("MEDICATIONS", { size: 9, f: bold, color: gray, gap: 12 });
    medications.shown.forEach((line) => drawLine(line, { size: 10 }));
    if (medications.hiddenCount > 0) drawUpsell(medications.hiddenCount);
  }

  // QR code + live-link footer, so a printed card can always be rescanned
  // back to the current live page.
  try {
    const qrDataUrl = await generateQrPngDataUrl(profileUrl);
    const qrImageBytes = Uint8Array.from(
      atob(qrDataUrl.split(",")[1]),
      (c) => c.charCodeAt(0)
    );
    const qrImage = await doc.embedPng(qrImageBytes);
    const qrSize = 90;
    page.drawImage(qrImage, {
      x: 396 - margin - qrSize,
      y: margin + 14,
      width: qrSize,
      height: qrSize,
    });
  } catch {
    // If QR embedding fails for any reason, the PDF still renders with the
    // text content — it just falls back to the plain URL below.
  }

  page.drawText(profileUrl.replace(/^https?:\/\//, ""), {
    x: margin,
    y: margin + 14,
    size: 8,
    font,
    color: gray,
  });
  page.drawText(`Last updated: ${new Date(profile.updated_at * 1000).toLocaleDateString()}`, {
    x: margin,
    y: margin,
    size: 8,
    font,
    color: gray,
  });

  return doc.save();
}
