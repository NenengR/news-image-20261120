import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

// Canvas dimensions
const WIDTH = 1024;
const HEIGHT = 1024;

// RGB frame buffer, row-major
const screen = Buffer.alloc(WIDTH * HEIGHT * 3);

function putPx(x: number, y: number, r: number, g: number, b: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 3;
  screen[idx] = r;
  screen[idx + 1] = g;
  screen[idx + 2] = b;
}

function paintBox(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  w = Math.floor(w);
  h = Math.floor(h);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      putPx(xx, yy, r, g, b);
    }
  }
}

const NAVY = [26, 42, 94];
const WHITE = [255, 255, 255];
const INK = [20, 20, 20];

// Embedded 5x7 bitmap font (6 px advance per glyph). Mandated K, V, comma shapes.
const GLYPHS: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '....#', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..##.', '.#...'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  "'": ['.....', '..#..', '..#..', '.....', '.....', '.....', '.....'],
  '%': ['#...#', '#...#', '..#..', '.#.#.', '#..#.', '#...#', '#...#'],
  '$': ['.###.', '#...#', '#.###', '..#..', '###.#', '#...#', '.###.'],
  '0': ['.###.', '#...#', '#.#.#', '#.#.#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  '2': ['.###.', '....#', '....#', '.###.', '#....', '#....', '#####'],
  '3': ['.###.', '....#', '....#', '.###.', '....#', '....#', '.###.'],
  '4': ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  '5': ['#####', '#....', '#....', '####.', '....#', '....#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  'A': ['.#.#.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#...#', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#....', '#..##', '#.#.#', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  'J': ['#####', '..#..', '..#..', '..#..', '#...#', '#...#', '.###.'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..##', '.###.'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.###.', '#....', '#....', '.###.', '....#', '....#', '.###.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..'],
  'W': ['#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};

function measure(text: string, scale: number): number {
  return text.length * 6 * scale;
}

function renderGlyph(text: string, originX: number, originY: number, scale: number, r: number, g: number, b: number): void {
  let cx = originX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const rows = GLYPHS[ch];
    if (!rows) {
      cx += 6 * scale;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      const bits = rows[row];
      for (let col = 0; col < 5; col++) {
        if (bits[col] === '#') {
          paintBox(cx + col * scale, originY + row * scale, scale, scale, r, g, b);
        }
      }
    }
    cx += 6 * scale;
  }
}

function renderWrapped(text: string, x: number, y: number, maxWidth: number, scale: number, r: number, g: number, b: number, lineGap = 4): number {
  const words = text.split(' ');
  let current = '';
  let cy = y;
  const lineH = 7 * scale;
  function emit() {
    if (current) renderGlyph(current, x, cy, scale, r, g, b);
  }
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (measure(candidate, scale) <= maxWidth) {
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

// Masthead band
paintBox(0, 0, WIDTH, 100, NAVY[0], NAVY[1], NAVY[2]);

const dateLine = 'FRIDAY 20 NOVEMBER 2026';
renderGlyph(dateLine, (WIDTH - measure(dateLine, 3)) / 2, 18, 3, WHITE[0], WHITE[1], WHITE[2]);

const mastHead = 'THE DAILY RECORD';
renderGlyph(mastHead, (WIDTH - measure(mastHead, 2)) / 2, 56, 2, WHITE[0], WHITE[1], WHITE[2]);

// Lead panel: full-width navy background first, then white text on top
paintBox(0, 100, WIDTH, 250, NAVY[0], NAVY[1], NAVY[2]);
renderGlyph('SUMMIT', 25, 130, 2, WHITE[0], WHITE[1], WHITE[2]);
const leadBottom = renderWrapped('TRUMP XI PUTIN SIGN PEACE PACT', 25, 160, WIDTH - 50, 4, WHITE[0], WHITE[1], WHITE[2]);
const leadSubY = leadBottom + 7 * 4 + 10;
renderWrapped('DECLARATION AFTER SHENZHEN SUMMIT', 25, leadSubY, WIDTH - 50, 2, WHITE[0], WHITE[1], WHITE[2]);

// Four smaller story panels in a 2x2 grid
const PANEL_W = 482;
const PANEL_H = 285;
const GAP = 20;
const leftCol = 25;
const rightCol = 25 + PANEL_W + GAP;
const topRow = 370;
const bottomRow = 370 + PANEL_H + GAP;

function storyCard(x: number, y: number, tag: string, head: string, sub: string): void {
  paintBox(x, y, PANEL_W, PANEL_H, NAVY[0], NAVY[1], NAVY[2]);            // outer border
  paintBox(x + 2, y + 2, PANEL_W - 4, PANEL_H - 4, WHITE[0], WHITE[1], WHITE[2]); // inner fill
  renderGlyph(tag, x + 14, y + 14, 2, INK[0], INK[1], INK[2]);
  const headEnd = renderWrapped(head, x + 14, y + 60, PANEL_W - 28, 3, INK[0], INK[1], INK[2]);
  const subY = headEnd + 7 * 3 + 6;
  renderWrapped(sub, x + 14, subY, PANEL_W - 28, 2, INK[0], INK[1], INK[2]);
}

storyCard(leftCol, topRow, 'UKRAINE', 'UK SENDS 1000 DRONES', '260 MILLION POUND AID PACKAGE');
storyCard(rightCol, topRow, 'CYBER', 'US CYBER CHIEF FIRED', 'AFTER NATIONWIDE OUTAGES');
storyCard(leftCol, bottomRow, 'TECH', 'ANTHROPIC SOARS 34 PERCENT', '2 TRILLION DOLLAR DEBUT');
storyCard(rightCol, bottomRow, 'EUROPE', 'UK-EU YOUTH DEAL AGREED', 'MOBILITY SCHEME SEALED');

// Bottom footer with date
paintBox(0, 985, WIDTH, 2, 0, 0, 0);
const footer = 'FIVE STORIES FROM FRIDAY 20 NOVEMBER 2026';
renderGlyph(footer, (WIDTH - measure(footer, 2)) / 2, 1002, 2, 0, 0, 0);

// ---------------- PNG encoding ----------------

function crc32(buf: Buffer, start: number, end: number, c: number): number {
  let crc = c ^ 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= buf[i];
    for (let b = 0; b < 8; b++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body, 0, body.length, 0), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w: number, h: number, px: Buffer): Buffer {
  const rowBytes = w * 3;
  const raw = Buffer.alloc(h * (1 + rowBytes));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + rowBytes);
    raw[off] = 0;
    px.copy(raw, off + 1, y * rowBytes, y * rowBytes + rowBytes);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), iend]);
}

// ---------------- Output ----------------

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG(WIDTH, HEIGHT, screen);
fs.writeFileSync(outDir + '/entry.png', png);
console.log('wrote', outDir + '/entry.png', png.length, 'bytes');
