import QRCode from "qrcode";

// Renders a QR code as an SVG string — pure matrix generation, no canvas —
// which is what makes this safe to run inside the Workers/Pages runtime.
export async function generateQrSvg(url) {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#1a2b4c", light: "#ffffff" },
  });
}

// A data: URI version, handy for embedding directly in an <img> tag or a PDF.
export async function generateQrPngDataUrl(url) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#1a2b4c", light: "#ffffff" },
  });
}
