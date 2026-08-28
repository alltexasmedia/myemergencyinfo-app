// Import the Node/server-safe implementation directly. The package's
// default entry point ("qrcode") resolves to its browser build under
// Cloudflare's Workers bundler (via the package's "browser" field), which
// requires a real <canvas> element and throws "You need to specify a
// canvas element" at runtime. The explicit /lib/server.js subpath bypasses
// that remap and forces the canvas-free implementation used here.
import QRCode from "qrcode/lib/server.js";
import { PNG } from "pngjs";

const BRAND_TEXT = "MY EMERGENCY INFO";
const DARK_HEX = "#1a2b4c";
const DARK_RGB = [0x1a, 0x2b, 0x4c];

// Renders a QR code as an SVG string — pure matrix generation, no canvas —
// which is what makes this safe to run inside the Workers/Pages runtime.
// The white quiet zone carries "MY EMERGENCY INFO" along all four edges.
export async function generateQrSvg(url) {
  const options = { errorCorrectionLevel: "M" };
  const moduleCount = QRCode.create(url, options).modules.size;
  const marginModules = 6;
  const baseSvg = await QRCode.toString(url, {
    ...options,
    type: "svg",
    margin: marginModules,
    color: { dark: DARK_HEX, light: "#ffffff" },
  });
  return addSvgBrandBorder(baseSvg, moduleCount, marginModules);
}

// Stamps BRAND_TEXT once along each of the four edges, inside the white
// quiet-zone band, onto an already-rendered QR <svg> string. Uses `replace`
// against the literal closing tag rather than parsing/rebuilding the SVG,
// so it doesn't depend on the exact internal markup the library emits —
// only that it's valid SVG (which it always is).
function addSvgBrandBorder(svgString, moduleCount, margin) {
  const dim = moduleCount + margin * 2;
  const half = dim / 2;
  const fontSize = margin * 0.6;
  const textLength = dim - margin * 1.6;
  const style = `font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="${DARK_HEX}" text-anchor="middle" dominant-baseline="middle" textLength="${textLength}" lengthAdjust="spacingAndGlyphs"`;

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

// A tiny 5-wide x 7-tall dot-matrix font covering just the letters (and
// space) BRAND_TEXT needs — intentionally self-contained rather than
// pulling in a font-rendering dependency, since there's no <canvas> here
// to draw text with.
const FONT_5x7 = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};
const GLYPH_GAP = 1;

// Renders `text` as a 2D grid of 0/1 (rows x cols) using FONT_5x7.
function renderTextBitmap(text) {
  const chars = text.split("");
  const width = chars.reduce((sum, ch) => sum + FONT_5x7[ch][0].length, 0) + GLYPH_GAP * (chars.length - 1);
  const bitmap = Array.from({ length: 7 }, () => new Uint8Array(width));
  let x = 0;
  for (const ch of chars) {
    const glyph = FONT_5x7[ch] || FONT_5x7[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") bitmap[row][x + col] = 1;
      }
    }
    x += glyph[0].length + GLYPH_GAP;
  }
  return bitmap;
}

function rotateBitmap90CW(bitmap) {
  const h = bitmap.length, w = bitmap[0].length;
  const out = Array.from({ length: w }, () => new Uint8Array(h));
  for (let row = 0; row < h; row++)
    for (let col = 0; col < w; col++) out[col][h - 1 - row] = bitmap[row][col];
  return out;
}

function rotateBitmap90CCW(bitmap) {
  const h = bitmap.length, w = bitmap[0].length;
  const out = Array.from({ length: w }, () => new Uint8Array(h));
  for (let row = 0; row < h; row++)
    for (let col = 0; col < w; col++) out[w - 1 - col][row] = bitmap[row][col];
  return out;
}

// Draws only the "on" pixels of `bitmap`, scaled up, with its top-left
// corner at (originX, originY). Pixels outside the image are skipped
// rather than throwing, so a rounding edge case can never crash the run.
function drawBitmap(png, dim, bitmap, originX, originY, scale) {
  for (let row = 0; row < bitmap.length; row++) {
    for (let col = 0; col < bitmap[0].length; col++) {
      if (!bitmap[row][col]) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const x = originX + col * scale + sx;
          const y = originY + row * scale + sy;
          if (x < 0 || y < 0 || x >= dim || y >= dim) continue;
          const idx = (dim * y + x) << 2;
          png.data[idx] = DARK_RGB[0];
          png.data[idx + 1] = DARK_RGB[1];
          png.data[idx + 2] = DARK_RGB[2];
          png.data[idx + 3] = 255;
        }
      }
    }
  }
}

// Stamps BRAND_TEXT along all four inner edges of the white quiet zone,
// directly onto the raw pixel buffer. This is the raster equivalent of
// addSvgBrandBorder above, for contexts (email attachment, PDF) that need
// an actual image rather than an <svg>.
function stampBrandBorder(png, dim, marginPx) {
  const base = renderTextBitmap(BRAND_TEXT);
  const bmH = base.length, bmW = base[0].length;

  // Largest integer scale that fits both the margin band's thickness and
  // the code's overall width, so the label can never touch the QR modules
  // or run off the edge of the image.
  const scale = Math.max(1, Math.min(
    Math.floor((marginPx - 6) / bmH),
    Math.floor((dim - marginPx * 2) / bmW)
  ));
  const textW = bmW * scale, textH = bmH * scale;
  const topX = Math.round((dim - textW) / 2);

  drawBitmap(png, dim, base, topX, Math.round((marginPx - textH) / 2), scale);
  drawBitmap(png, dim, base, topX, dim - marginPx + Math.round((marginPx - textH) / 2), scale);

  const left = rotateBitmap90CCW(base);
  const right = rotateBitmap90CW(base);
  const rTextW = textH, rTextH = textW; // dimensions swap after rotation
  const sideY = Math.round((dim - rTextH) / 2);

  drawBitmap(png, dim, left, Math.round((marginPx - rTextW) / 2), sideY, scale);
  drawBitmap(png, dim, right, dim - marginPx + Math.round((marginPx - rTextW) / 2), sideY, scale);
}

async function renderBrandedQrPng(url) {
  const options = { errorCorrectionLevel: "M" };
  const matrix = QRCode.create(url, options).modules;
  const moduleCount = matrix.size;
  const moduleScale = 10;
  const marginModules = 8;
  const marginPx = marginModules * moduleScale;
  const dim = (moduleCount + marginModules * 2) * moduleScale;

  const png = new PNG({ width: dim, height: dim });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0xff;
    png.data[i + 1] = 0xff;
    png.data[i + 2] = 0xff;
    png.data[i + 3] = 255;
  }

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!matrix.get(row, col)) continue;
      const x0 = marginPx + col * moduleScale;
      const y0 = marginPx + row * moduleScale;
      for (let dy = 0; dy < moduleScale; dy++) {
        for (let dx = 0; dx < moduleScale; dx++) {
          const idx = (dim * (y0 + dy) + (x0 + dx)) << 2;
          png.data[idx] = DARK_RGB[0];
          png.data[idx + 1] = DARK_RGB[1];
          png.data[idx + 2] = DARK_RGB[2];
          png.data[idx + 3] = 255;
        }
      }
    }
  }

  stampBrandBorder(png, dim, marginPx);

  const buffer = PNG.sync.write(png);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// A data: URI version, handy for embedding directly in an <img> tag or a
// PDF. Tries the branded raster renderer above first; if anything about
// that custom pixel-drawing goes wrong for a given input, this falls back
// to the library's plain (unbranded but always-reliable) PNG rather than
// breaking the email/PDF that depends on this.
export async function generateQrPngDataUrl(url) {
  try {
    return await renderBrandedQrPng(url);
  } catch {
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: DARK_HEX, light: "#ffffff" },
    });
  }
}
