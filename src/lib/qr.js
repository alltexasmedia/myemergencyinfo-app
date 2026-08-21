import QRCode from "qrcode";

const BRAND_TEXT = "MY EMERGENCY INFO";
// Wider quiet zone than the default (2 modules) so there's real room for the
// border text without ever crowding the scannable code itself.
const SVG_MARGIN_MODULES = 6;

// Stamps BRAND_TEXT once along each of the four edges, inside the white
// quiet-zone band, onto an already-rendered QR <svg> string. Uses `replace`
// against the literal closing tag rather than parsing/rebuilding the SVG, so
// it doesn't depend on the exact internal markup the qrcode library emits —
// only that it's valid SVG (which it always is).
function addBrandedBorder(svgString, moduleCount, margin) {
  const dim = moduleCount + margin * 2;
  const half = dim / 2;
  const fontSize = margin * 0.6;
  // Force every label to the same on-screen width regardless of glyph
  // metrics, so it can never overflow past the quiet zone into the modules.
  const textLength = dim - margin * 1.6;
  const style = `font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="#1a2b4c" text-anchor="middle" dominant-baseline="middle" textLength="${textLength}" lengthAdjust="spacingAndGlyphs"`;

  const topY = margin / 2;
  const bottomY = dim - margin / 2;
  const leftX = margin / 2;
  const rightX = dim - margin / 2;

  const labels =
    `<text x="${half}" y="${topY}" ${style}>${BRAND_TEXT}</text>` +
    `<text x="${half}" y="${bottomY}" ${style}>${BRAND_TEXT}</text>` +
    `<text x="${leftX}" y="${half}" ${style} transform="rotate(-90 ${leftX} ${half})">${BRAND_TEXT}</text>` +
    `<text x="${rightX}" y="${half}" ${style} transform="rotate(90 ${rightX} ${half})">${BRAND_TEXT}</text>`;

  return svgString.replace("</svg>", `${labels}</svg>`);
}

// Renders a QR code as an SVG string — pure matrix generation, no canvas —
// which is what makes this safe to run inside the Workers/Pages runtime.
// The white quiet zone carries "MY EMERGENCY INFO" along all four edges.
export async function generateQrSvg(url) {
  const options = { errorCorrectionLevel: "M" };
  const moduleCount = QRCode.create(url, options).modules.size;
  const baseSvg = await QRCode.toString(url, {
    ...options,
    type: "svg",
    margin: SVG_MARGIN_MODULES,
    color: { dark: "#1a2b4c", light: "#ffffff" },
  });
  return addBrandedBorder(baseSvg, moduleCount, SVG_MARGIN_MODULES);
}

// A data: URI version, handy for embedding directly in an <img> tag or a PDF.
export async function generateQrPngDataUrl(url) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#1a2b4c", light: "#ffffff" },
  });
}
