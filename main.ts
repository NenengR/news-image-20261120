import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

// Canvas size in pixels
const CANVAS_W = 0x400;
const CANVAS_H = 0x400;

// RGB frame buffer, row-major
const fb = Buffer.alloc(CANVAS_W * CANVAS_H * 3);

// Plot a single pixel, clamping out of bounds
function dot(x: number, y: number, r: number, g: number, b: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) return;
  const i = (y * CANVAS_W + x) * 3;
  fb[i] = r;
  fb[i + 1] = g;
  fb[i + 2] = b;
}

// Paint a filled rectangle
function block(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  w = Math.floor(w);
  h = Math.floor(h);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      dot(xx, yy, r, g, b);
    }
  }
}

// Palette
const COL_NAVY = [0x1a, 0x2a, 0x5e];
const COL_WHITE = [0xff, 0xff, 0xff];
const COL_DARK = [0x14, 0x14, 0x14];

// Embedded 5x7 bitmap font, 6 px advance per glyph. Mandated K, V, comma shapes.
const GLYPH: Record<string, string[]> = {
  ' ': [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  '.': [".....", ".....", ".....", ".....", ".....", "....#", "....."],
  ',': [".....", ".....", ".....", ".....", ".....", "..##.", ".#..."],
  '-': [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "'": [".....", "..#..", "..#..", ".....", ".....", ".....", "....."],
  '%': ["#...#", "#...#", "..#..", ".#.#.", "#..#.", "#...#", "#...#"],
  '$': [".###.", "#...#", "#.###", "..#..", "###.#", "#...#", ".###."],
  '0': [".###.", "#...#", "#.#.#", "#.#.#", "#...#", "#...#", ".###."],
  '1': ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
  '2': [".###.", "....#", "....#", ".###.", "#....", "#....", "#####"],
  '3': [".###.", "....#", "....#", ".###.", "....#", "....#", ".###."],
  '4': ["#...#", "#...#", "#...#", "#####", "....#", "....#", "....#"],
  '5': ["#####", "#....", "#....", "####.", "....#", "....#", ".###."],
  '6': [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  '7': ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  '8': [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  '9': [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  'A': [".#.#.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  'B': ["####.", "#...#", "####.", "#...#", "#...#", "#...#", "####."],
  'C': [".###.", "#...#", "#....", "#....", "#...#", "#...#", ".###."],
  'D': ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  'E': ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  'F': ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  'G': [".###.", "#....", "#..##", "#.#.#", "#...#", "#...#", ".###."],
  'H': ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  'I': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  'J': ["#####", "..#..", "..#..", "..#..", "#...#", "#...#", ".###."],
  'K': ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  'L': ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  'M': ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  'N': ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  'O': [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  'P': ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  'Q': [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..##", ".###."],
  'R': ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  'S': [".###.", "#....", "#....", ".###.", "....#", "....#", ".###."],
  'T': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  'U': ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  'V': ["#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#..", "..#.."],
  'W': ["#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", "##.##", "#...#"],
  'X': ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  'Y': ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  'Z': ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
};

// Pixel width of a text run at a given scale
function widthOf(text: string, scale: number): number {
  return text.length * 6 * scale;
}

// Stamp a string of glyphs onto the buffer
function stamp(text: string, originX: number, originY: number, scale: number, r: number, g: number, b: number): void {
  let cx = originX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const rows = GLYPH[ch];
    if (!rows) {
      cx += 6 * scale;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      const bits = rows[row];
      for (let col = 0; col < 5; col++) {
        if (bits[col] === '#') {
          block(cx + col * scale, originY + row * scale, scale, scale, r, g, b);
        }
      }
    }
    cx += 6 * scale;
  }
}

// Wrap words into lines and stamp them, returning the bottom edge
function flow(text: string, x: number, y: number, maxWidth: number, scale: number, r: number, g: number, b: number, lineGap = 4): number {
  const words = text.split(' ');
  let current = '';
  let cy = y;
  const lineH = 7 * scale;
  function emit(): void {
    if (current) stamp(current, x, cy, scale, r, g, b);
  }
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (widthOf(candidate, scale) <= maxWidth) {
      current = candidate;
    } else {
      emit();
      cy += lineH + lineGap;
      current = word;
    }
  }
  emit();
  return cy + lineH;
}

// ---------------- Page composition ----------------

// Draw the masthead band and date/title
block(0, 0, CANVAS_W, 0x64, COL_NAVY[0], COL_NAVY[1], COL_NAVY[2]);

const dateLine = 'FRIDAY 20 NOVEMBER 2026';
stamp(dateLine, (CANVAS_W - widthOf(dateLine, 3)) / 2, 0x12, 3, COL_WHITE[0], COL_WHITE[1], COL_WHITE[2]);

const mastHead = 'THE DAILY RECORD';
stamp(mastHead, (CANVAS_W - widthOf(mastHead, 2)) / 2, 0x38, 2, COL_WHITE[0], COL_WHITE[1], COL_WHITE[2]);

// Lead panel: full-width navy background first, then white text on top
block(0, 0x64, CANVAS_W, 0xfa, COL_NAVY[0], COL_NAVY[1], COL_NAVY[2]);
stamp('SUMMIT', 0x19, 0x82, 2, COL_WHITE[0], COL_WHITE[1], COL_WHITE[2]);
const leadBottom = flow('TRUMP XI PUTIN SIGN PEACE PACT', 0x19, 0xa0, CANVAS_W - 0x32, 4, COL_WHITE[0], COL_WHITE[1], COL_WHITE[2]);
const leadSubY = leadBottom + 7 * 4 + 0xa;
flow('DECLARATION AFTER SHENZHEN SUMMIT', 0x19, leadSubY, CANVAS_W - 0x32, 2, COL_WHITE[0], COL_WHITE[1], COL_WHITE[2]);

// Four smaller story panels in a 2x2 grid
const CARD_W = 0x1e2;
const CARD_H = 0x11d;
const CARD_GAP = 0x14;
const LEFT_X = 0x19;
const RIGHT_X = 0x19 + CARD_W + CARD_GAP;
const TOP_Y = 0x172;
const BOTTOM_Y = 0x172 + CARD_H + CARD_GAP;

// Draw one story card: navy border, white interior, tag/headline/subhead in dark ink
function card(x: number, y: number, tag: string, head: string, sub: string): void {
  block(x, y, CARD_W, CARD_H, COL_NAVY[0], COL_NAVY[1], COL_NAVY[2]);
  block(x + 2, y + 2, CARD_W - 4, CARD_H - 4, COL_WHITE[0], COL_WHITE[1], COL_WHITE[2]);
  stamp(tag, x + 0xe, y + 0xe, 2, COL_DARK[0], COL_DARK[1], COL_DARK[2]);
  const headEnd = flow(head, x + 0xe, y + 0x3c, CARD_W - 0x1c, 3, COL_DARK[0], COL_DARK[1], COL_DARK[2]);
  const subY = headEnd + 7 * 3 + 6;
  flow(sub, x + 0xe, subY, CARD_W - 0x1c, 2, COL_DARK[0], COL_DARK[1], COL_DARK[2]);
}

card(LEFT_X, TOP_Y, 'UKRAINE', 'UK SENDS 1000 DRONES', '260 MILLION POUND AID PACKAGE');
card(RIGHT_X, TOP_Y, 'CYBER', 'US CYBER CHIEF FIRED', 'AFTER NATIONWIDE OUTAGES');
card(LEFT_X, BOTTOM_Y, 'TECH', 'ANTHROPIC SOARS 34 PERCENT', '2 TRILLION DOLLAR DEBUT');
card(RIGHT_X, BOTTOM_Y, 'EUROPE', 'UK-EU YOUTH DEAL AGREED', 'MOBILITY SCHEME SEALED');

// Bottom footer with date
block(0, 0x3d9, CANVAS_W, 2, 0, 0, 0);
const footer = 'FIVE STORIES FROM FRIDAY 20 NOVEMBER 2026';
stamp(footer, (CANVAS_W - widthOf(footer, 2)) / 2, 0x3ea, 2, 0, 0, 0);

// ---------------- PNG encoding ----------------

// CRC-32 helper used by PNG chunks
function crcSum(buf: Buffer, start: number, end: number, c: number): number {
  let crc = c ^ 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= buf[i];
    for (let b = 0; b < 8; b++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Build a complete PNG chunk (length, type, data, CRC)
function packChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcSum(body, 0, body.length, 0), 0);
  return Buffer.concat([len, body, crc]);
}

// Encode the frame buffer as a PNG byte sequence
function toPng(w: number, h: number, px: Buffer): Buffer {
  const rowBytes = w * 3;
  const raw = Buffer.alloc(h * (1 + rowBytes));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + rowBytes);
    raw[off] = 0;
    px.copy(raw, off + 1, y * rowBytes, y * rowBytes + rowBytes);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(0xd);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = packChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, packChunk('IHDR', ihdr), packChunk('IDAT', idat), iend]);
}

// ---------------- Output ----------------

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
fs.mkdirSync(outDir, { recursive: true });
const png = toPng(CANVAS_W, CANVAS_H, fb);
fs.writeFileSync(outDir + '/entry.png', png);
console.log('wrote', outDir + '/entry.png', png.length, 'bytes');
