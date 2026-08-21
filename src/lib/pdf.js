import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { generateQrPngDataUrl } from "./qr.js";

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

  if (profile.emergency_contacts?.length) {
    y -= 4;
    drawLine("EMERGENCY CONTACTS", { size: 9, f: bold, color: gray, gap: 12 });
    profile.emergency_contacts.forEach((c) => {
      drawLine(`${c.name} (${c.relationship}) — ${c.phone}`, { size: 10 });
    });
    y -= 6;
  }

  if (profile.doctors?.length) {
    drawLine("DOCTORS", { size: 9, f: bold, color: gray, gap: 12 });
    profile.doctors.forEach((d) => {
      drawLine(`${d.name}, ${d.specialty} — ${d.phone}`, { size: 10 });
    });
    y -= 6;
  }

  if (profile.medications?.length) {
    drawLine("MEDICATIONS", { size: 9, f: bold, color: gray, gap: 12 });
    profile.medications.forEach((m) => {
      drawLine(`${m.name} ${m.dosage ? "— " + m.dosage : ""} ${m.frequency ? "(" + m.frequency + ")" : ""}`, {
        size: 10,
      });
    });
  }

  // QR code + live-link footer, so a printed card can always be rescanned
  // back to the current live page. The white space framing the code carries
  // "MY EMERGENCY INFO" on all four sides — drawn as plain PDF text around
  // the (unbranded) QR image, rather than baked into the QR's own pixels, so
  // this can't ever interfere with the code's scannability.
  try {
    const qrDataUrl = await generateQrPngDataUrl(profileUrl);
    const qrImageBytes = Uint8Array.from(
      atob(qrDataUrl.split(",")[1]),
      (c) => c.charCodeAt(0)
    );
    const qrImage = await doc.embedPng(qrImageBytes);

    const qrSize = 78;
    const frame = 13; // reserved band, in points, for the border text
    const blockSize = qrSize + frame * 2;
    const blockX = 396 - margin - blockSize;
    const blockY = margin + 10;

    page.drawImage(qrImage, {
      x: blockX + frame,
      y: blockY + frame,
      width: qrSize,
      height: qrSize,
    });

    const label = "MY EMERGENCY INFO";
    const labelSize = 5.5;
    const labelWidth = bold.widthOfTextAtSize(label, labelSize);
    const centerX = blockX + blockSize / 2;
    const centerY = blockY + blockSize / 2;

    page.drawText(label, {
      x: centerX - labelWidth / 2,
      y: blockY + blockSize - frame * 0.6,
      size: labelSize,
      font: bold,
      color: navy,
    });
    page.drawText(label, {
      x: centerX - labelWidth / 2,
      y: blockY + frame * 0.35,
      size: labelSize,
      font: bold,
      color: navy,
    });
    page.drawText(label, {
      x: blockX + frame * 0.6,
      y: centerY - labelWidth / 2,
      size: labelSize,
      font: bold,
      color: navy,
      rotate: degrees(90),
    });
    page.drawText(label, {
      x: blockX + blockSize - frame * 0.35,
      y: centerY - labelWidth / 2,
      size: labelSize,
      font: bold,
      color: navy,
      rotate: degrees(-90),
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
