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
// "Highlighter" band drawn behind the brand text on each edge, mimicking
// the yellow-highlighter look the user found helped legibility after
// printing/cutting the wallet card.
const HIGHLIGHT_HEX = "#ffeb3b";
const HIGHLIGHT_RGB = [0xff, 0xeb, 0x3b];

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
  // Bumped from 700 to 900 plus a thin matching stroke, purely to make the
  // edge labels read as bolder on the printed/cut wallet card.
  const style = `font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize}" fill="${DARK_HEX}" stroke="${DARK_HEX}" stroke-width="${fontSize * 0.04}" text-anchor="middle" dominant-baseline="middle" textLength="${textLength}" lengthAdjust="spacingAndGlyphs"`;

  const topY = margin / 2;
  const bottomY = dim - margin / 2;
  const leftX = margin / 2;
  const rightX = dim - margin / 2;

  // Yellow "highlighter" band sized to sit just behind each label, drawn
  // before the text so the text renders on top of it.
  const hlW = textLength + fontSize * 0.5;
  const hlH = fontSize * 1.15;
  const highlight = (cx, cy, rotate) =>
    `<rect x="${cx - hlW / 2}" y="${cy - hlH / 2}" width="${hlW}" height="${hlH}" fill="${HIGHLIGHT_HEX}"${
      rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : ""
    }/>`;

  const labels =
    highlight(half, topY, 0) +
    `<text x="${half}" y="${topY}" ${style}>${BRAND_TEXT}</text>` +
    highlight(half, bottomY, 0) +
    `<text x="${half}" y="${bottomY}" ${style}>${BRAND_TEXT}</text>` +
    highlight(leftX, half, -90) +
    `<text x="${leftX}" y="${half}" ${style} transform="rotate(-90 ${leftX} ${half})">${BRAND_TEXT}</text>` +
    highlight(rightX, half, 90) +
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
const GLYPH_GAP = 2;

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
  return boldenBitmap(bitmap);
}

// Faux-bold: thickens every stroke by 1 pre-scale pixel to the right only.
// (An earlier version also OR'd the row below, which erased the internal
// details — R's open leg, E's crossbar gap, G's notch — that make these
// blocky letters legible in the first place, and it ate the inter-letter
// gap too, causing words to smear together. Horizontal-only dilation
// keeps every glyph's internal shape intact.)
function boldenBitmap(bitmap) {
  const h = bitmap.length, w = bitmap[0].length;
  const out = Array.from({ length: h }, () => new Uint8Array(w));
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      out[row][col] = bitmap[row][col] || (col + 1 < w && bitmap[row][col + 1]) ? 1 : 0;
    }
  }
  return out;
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

// Fills a solid rectangle directly on the pixel buffer (used for the
// yellow "highlighter" band). Clamped to the image bounds so a rounding
// edge case can never throw.
function fillRect(png, dim, x0, y0, w, h, rgb) {
  const xStart = Math.max(0, Math.round(x0));
  const yStart = Math.max(0, Math.round(y0));
  const xEnd = Math.min(dim, Math.round(x0 + w));
  const yEnd = Math.min(dim, Math.round(y0 + h));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (dim * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
}

// Keeps a highlight band's position+size within [bandStart, bandEnd] along
// one axis, so the yellow band can never bleed into the QR modules or off
// the edge of the image.
function clampToBand(pos, size, bandStart, bandEnd) {
  if (size >= bandEnd - bandStart) return bandStart;
  return Math.min(Math.max(pos, bandStart), bandEnd - size);
}

// Draws the yellow highlighter band behind one label instance. `axis`
// picks which dimension gets clamped to the margin band: "y" for the
// top/bottom (horizontal) labels, "x" for the left/right (rotated) ones.
function drawHighlight(png, dim, textX, textY, textW, textH, pad, bandStart, bandEnd, axis) {
  let rx = textX - pad, ry = textY - pad;
  const rw = textW + pad * 2, rh = textH + pad * 2;
  if (axis === "y") ry = clampToBand(ry, rh, bandStart, bandEnd);
  else rx = clampToBand(rx, rw, bandStart, bandEnd);
  fillRect(png, dim, rx, ry, rw, rh, HIGHLIGHT_RGB);
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
  const pad = Math.max(2, Math.round(scale * 0.6)); // highlight band padding around each label

  const topTextY = Math.round((marginPx - textH) / 2);
  const bottomTextY = dim - marginPx + topTextY;

  drawHighlight(png, dim, topX, topTextY, textW, textH, pad, 0, marginPx, "y");
  drawBitmap(png, dim, base, topX, topTextY, scale);
  drawHighlight(png, dim, topX, bottomTextY, textW, textH, pad, dim - marginPx, dim, "y");
  drawBitmap(png, dim, base, topX, bottomTextY, scale);

  const left = rotateBitmap90CCW(base);
  const right = rotateBitmap90CW(base);
  const rTextW = textH, rTextH = textW; // dimensions swap after rotation
  const sideY = Math.round((dim - rTextH) / 2);
  const leftTextX = Math.round((marginPx - rTextW) / 2);
  const rightTextX = dim - marginPx + leftTextX;

  drawHighlight(png, dim, leftTextX, sideY, rTextW, rTextH, pad, 0, marginPx, "x");
  drawBitmap(png, dim, left, leftTextX, sideY, scale);
  drawHighlight(png, dim, rightTextX, sideY, rTextW, rTextH, pad, dim - marginPx, dim, "x");
  drawBitmap(png, dim, right, rightTextX, sideY, scale);
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
