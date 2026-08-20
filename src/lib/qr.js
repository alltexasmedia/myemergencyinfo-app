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

// --- Canvas-free PNG rendering -------------------------------------------
// QRCode.toDataURL() / toCanvas() / toBuffer() all need a real <canvas>
// element (browser) or the `canvas` npm package (Node) to rasterize pixels.
// Cloudflare Workers has neither, so calling toDataURL() there throws
// "Error: You need to specify a canvas element" — every single time.
//
// That was the actual root cause of the whole broken signup pipeline: the
// webhook handler generated this data URL *before* kicking off the
// confirmation email, so the crash happened first and the email code below
// it never ran. GHL saw a 500 and marked the webhook Failed/Retry; Cloudflare
// didn't count it as an "Error" because the crash was caught by the outer
// try/catch and turned into a normal (if useless) 500 response; Resend never
// saw a request because the code never got that far.
//
// The fix: pull the raw QR module matrix (pure JS, no canvas — the same
// data the SVG renderer above already uses successfully) and rasterize it
// to a real PNG ourselves, using nothing but the standard CompressionStream
// Web API, which Cloudflare Workers supports natively. No canvas, no
// node:zlib, no extra dependency, no compatibility flags needed.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concatBytes(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function makeChunk(type, data) {
  const typeBytes = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
  const typeAndData = concatBytes([typeBytes, data]);
  const crc = crc32(typeAndData);
  return concatBytes([u32be(data.length), typeAndData, u32be(crc)]);
}

// CompressionStream("deflate") outputs a complete RFC1950 zlib stream
// (2-byte header + deflate data + 4-byte Adler32 trailer) — exactly the
// format a PNG IDAT chunk's content needs to be, no extra wrapping required.
async function deflateZlib(bytes) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concatBytes(chunks);
}

// Rasterizes a QRCode.create() module matrix into raw PNG bytes (8-bit RGB,
// no interlace), with a quiet-zone margin and an integer pixel scale per
// module.
async function matrixToPngBytes(
  modules,
  { scale = 8, marginModules = 4, dark = [26, 43, 76], light = [255, 255, 255] } = {}
) {
  const { size, data } = modules;
  const modulesPerSide = size + marginModules * 2;
  const pxSize = modulesPerSide * scale;
  const stride = pxSize * 3; // 3 bytes/pixel, RGB
  const raw = new Uint8Array((stride + 1) * pxSize); // +1 filter byte per row

  for (let py = 0; py < pxSize; py++) {
    const rowStart = py * (stride + 1);
    raw[rowStart] = 0; // filter type 0 = None
    const moduleRow = Math.floor(py / scale) - marginModules;
    for (let px = 0; px < pxSize; px++) {
      const moduleCol = Math.floor(px / scale) - marginModules;
      let isDark = false;
      if (moduleRow >= 0 && moduleRow < size && moduleCol >= 0 && moduleCol < size) {
        isDark = !!data[moduleRow * size + moduleCol];
      }
      const [r, g, b] = isDark ? dark : light;
      const o = rowStart + 1 + px * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }

  const zlibData = await deflateZlib(raw);
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = concatBytes([
    u32be(pxSize),
    u32be(pxSize),
    new Uint8Array([8, 2, 0, 0, 0]), // bitDepth=8, colorType=2 (RGB), compression/filter/interlace=0
  ]);
  return concatBytes([
    signature,
    makeChunk("IHDR", ihdrData),
    makeChunk("IDAT", zlibData),
    makeChunk("IEND", new Uint8Array(0)),
  ]);
}

// Raw PNG bytes — handy for embedding directly in a PDF via pdf-lib without
// a base64 round-trip.
export async function generateQrPngBytes(url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  return matrixToPngBytes(qr.modules);
}

// A data: URI version, handy for embedding directly in an <img> tag or an
// email attachment. Same public signature as before, so nothing calling
// this needs to change.
export async function generateQrPngDataUrl(url) {
  const bytes = await generateQrPngBytes(url);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(binary)}`;
}
