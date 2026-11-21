import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

const W = 1024;
const H = 1024;
const pix = Buffer.alloc(W * H * 3);

function setPixel(x: number, y: number, r: number, g: number, b: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  pix[i] = r;
  pix[i + 1] = g;
  pix[i + 2] = b;
}

function fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  w = Math.floor(w);
  h = Math.floor(h);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPixel(xx, yy, r, g, b);
    }
  }
}

const NAVY: [number, number, number] = [26, 42, 94];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [20, 20, 20];

// 5x7 bitmap font. K, V and comma follow the mandated definitions exactly.
const FONT: Record<string, string[]> = {
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

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale;
}

function drawText(text: string, x: number, y: number, scale: number, r: number, g: number, b: number): void {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const gl = FONT[ch];
    if (!gl) {
      cx += 6 * scale;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      const line = gl[row];
      for (let col = 0; col < 5; col++) {
        if (line[col] === '#') {
          fillRect(cx + col * scale, y + row * scale, scale, scale, r, g, b);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawWrapped(text: string, x: number, y: number, maxW: number, scale: number, r: number, g: number, b: number, lineGap = 4): number {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  const lineHeight = 7 * scale;
  function flush(): void {
    if (line) drawText(line, x, cy, scale, r, g, b);
  }
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (textWidth(trial, scale) <= maxW) {
      line = trial;
    } else {
      flush();
      cy += lineHeight + lineGap;
      line = w;
    }
  }
  flush();
  return cy + lineHeight;
}

// ---------- Layout ----------
// Masthead
fillRect(0, 0, W, 100, NAVY[0], NAVY[1], NAVY[2]);

const dateText = 'FRIDAY 20 NOVEMBER 2026';
drawText(dateText, (W - textWidth(dateText, 3)) / 2, 18, 3, WHITE[0], WHITE[1], WHITE[2]);

const mastTitle = 'THE DAILY RECORD';
drawText(mastTitle, (W - textWidth(mastTitle, 2)) / 2, 56, 2, WHITE[0], WHITE[1], WHITE[2]);

// Lead panel: full width, navy background, white text (background drawn first) -- shrunk height
fillRect(0, 100, W, 250, NAVY[0], NAVY[1], NAVY[2]);
drawText('SUMMIT', 25, 130, 2, WHITE[0], WHITE[1], WHITE[2]);
const leadHeadEnd = drawWrapped('TRUMP XI PUTIN SIGN PEACE PACT', 25, 160, W - 50, 4, WHITE[0], WHITE[1], WHITE[2]);
const leadSubY = leadHeadEnd + 7 * 4 + 10;
drawWrapped('DECLARATION AFTER SHENZHEN SUMMIT', 25, leadSubY, W - 50, 2, WHITE[0], WHITE[1], WHITE[2]);

// ---------- Lower panels (2x2) ----------
const PANEL_W = 482;
const PANEL_H = 285;
const GAP = 20;
const cols = [25, 25 + PANEL_W + GAP];
const rows = [370, 370 + PANEL_H + GAP];

function drawPanel(x: number, y: number, tag: string, title: string, sub: string): void {
  fillRect(x, y, PANEL_W, PANEL_H, NAVY[0], NAVY[1], NAVY[2]);          // border
  fillRect(x + 2, y + 2, PANEL_W - 4, PANEL_H - 4, WHITE[0], WHITE[1], WHITE[2]); // interior
  drawText(tag, x + 14, y + 14, 2, DARK[0], DARK[1], DARK[2]);
  const titleEnd = drawWrapped(title, x + 14, y + 60, PANEL_W - 28, 3, DARK[0], DARK[1], DARK[2]);
  const subY = titleEnd + 7 * 3 + 6;
  drawWrapped(sub, x + 14, subY, PANEL_W - 28, 2, DARK[0], DARK[1], DARK[2]);
}

drawPanel(cols[0], rows[0], 'UKRAINE', 'UK SENDS 1000 DRONES', '260 MILLION POUND AID PACKAGE');
drawPanel(cols[1], rows[0], 'CYBER', 'US CYBER CHIEF FIRED', 'AFTER NATIONWIDE OUTAGES');
drawPanel(cols[0], rows[1], 'TECH', 'ANTHROPIC SOARS 34 PERCENT', '2 TRILLION DOLLAR DEBUT');
drawPanel(cols[1], rows[1], 'EUROPE', 'UK-EU YOUTH DEAL AGREED', 'MOBILITY SCHEME SEALED');

// Footer line at the bottom with the date
fillRect(0, 985, W, 2, 0, 0, 0);
const foot = 'FIVE STORIES FROM FRIDAY 20 NOVEMBER 2026';
drawText(foot, (W - textWidth(foot, 2)) / 2, 1002, 2, 0, 0, 0);

// ---------- PNG encoder ----------
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

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body, 0, body.length, 0), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w: number, h: number, pixels: Buffer): Buffer {
  const rowBytes = w * 3;
  const raw = Buffer.alloc(h * (1 + rowBytes));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + rowBytes);
    raw[off] = 0;
    pixels.copy(raw, off + 1, y * rowBytes, y * rowBytes + rowBytes);
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
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), iend]);
}

// ---------- Write ----------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG(W, H, pix);
fs.writeFileSync(outDir + '/entry.png', png);
console.log('wrote', outDir + '/entry.png', png.length, 'bytes');
