import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { generateQrPngDataUrl } from "./qr.js";

// The "wallet card" is deliberately almost blank: this is for people who
// may not know what a QR code is, so it says one thing, shows one code,
// and nothing else competes for attention. All the actual info (contacts,
// doctors, medications, conditions) lives on the full profile page the
// code scans to — not on the card itself. Keeping the card's own content
// this sparse also leaves as much physical size as possible for the QR
// code itself, which matters more for reliable scanning than anything
// else on the card.
//
// It's printed on a normal Letter page (not a tiny custom page size) with
// a dashed cut-line marking a true wallet-card footprint. That's on
// purpose: a standard Letter page always prints at the right physical
// size by default, so there's nothing for anyone to get wrong in the
// print dialog (no "Actual size" vs "Fit to page" setting to remember) —
// they just print normally and cut along the dashed line.
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const CARD_WIDTH = 252; // 3.5in — standard wallet/credit-card width
const CARD_HEIGHT = 144; // 2in
const NAVY = rgb(0.1, 0.17, 0.3);
const GRAY = rgb(0.45, 0.48, 0.52);
const BLACK = rgb(0, 0, 0);

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

function drawCentered(page, text, { centerX, y, size, font, color }) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - width / 2, y, size, font, color });
}

export async function generateProfilePdf(profile, profileUrl) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageCenterX = PAGE_WIDTH / 2;

  // Printing instructions, above the card, in plain language.
  const introLines = [
    `Emergency card for ${profile.full_name || "this person"}`,
    "Print this page normally, then cut out the card below along the dashed line.",
  ];
  let introY = PAGE_HEIGHT - 90;
  for (const line of introLines) {
    drawCentered(page, line, { centerX: pageCenterX, y: introY, size: 12, font, color: NAVY });
    introY -= 16;
  }

  // The card itself, centered on the page.
  const cardX = pageCenterX - CARD_WIDTH / 2;
  const cardY = PAGE_HEIGHT - 170 - CARD_HEIGHT;

  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderColor: GRAY,
    borderWidth: 1,
    borderDashArray: [4, 3],
  });

  // Kept tight on purpose — every point of padding/text here is a point
  // not available to the QR code, which is the part that actually has to
  // work reliably when scanned.
  const padding = 10;
  const innerWidth = CARD_WIDTH - padding * 2;
  const innerBottom = cardY + padding;
  let y = cardY + CARD_HEIGHT - padding - 11;

  drawCentered(page, "MY EMERGENCY INFO", {
    centerX: cardX + CARD_WIDTH / 2,
    y,
    size: 13,
    font: bold,
    color: NAVY,
  });
  y -= 16;

  const instructionLines = wrapText("SCAN THIS CODE FOR MY EMERGENCY INFO NOW", bold, 9, innerWidth);
  for (const line of instructionLines) {
    drawCentered(page, line, { centerX: cardX + CARD_WIDTH / 2, y, size: 9, font: bold, color: BLACK });
    y -= 10.5;
  }
  y -= 3;

  // The QR code fills essentially all the remaining room inside the card —
  // that's the point of stripping everything else down.
  const qrSize = Math.min(innerWidth, y - innerBottom);
  const qrX = cardX + (CARD_WIDTH - qrSize) / 2;
  const qrY = y - qrSize;

  try {
    const qrDataUrl = await generateQrPngDataUrl(profileUrl);
    const qrImageBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const qrImage = await doc.embedPng(qrImageBytes);
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  } catch {
    // If QR embedding fails, the card still shows its text — no crash.
  }

  // Fallback address lives outside the dashed card (so it doesn't shrink
  // the QR or clutter the card), in case a scan ever fails and someone —
  // a caregiver, a dispatcher — needs to type the link in by hand instead.
  drawCentered(page, `Or visit: ${profileUrl.replace(/^https?:\/\//, "")}`, {
    centerX: pageCenterX,
    y: cardY - 20,
    size: 8,
    font,
    color: GRAY,
  });

  return doc.save();
}
