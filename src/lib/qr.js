// Import the Node/server-safe implementation directly. The package's
// default entry point ("qrcode") resolves to its browser build under
// Cloudflare's Workers bundler (via the package's "browser" field), which
// requires a real <canvas> element and throws "You need to specify a
// canvas element" at runtime. The explicit /lib/server.js subpath bypasses
// that remap and forces the canvas-free implementation used here.
import QRCode from "qrcode/lib/server.js";

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
