import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

const W = 1024;
const H = 1024;
const fb = new Uint8Array(W * H * 4);
for (let i = 0; i < fb.length; i += 4) { fb[i] = 255; fb[i+1] = 255; fb[i+2] = 255; fb[i+3] = 255; }

// 5x7 bitmap font: each glyph row stored as a numeric bitmask 0..31 (bit 4 = leftmost pixel)
const FONT: Record<string, number[]> = {
  " ": [0,0,0,0,0,0,0],
  "-": [0,0,14,0,0,0,0],
  "0": [14,17,21,21,17,17,14],
  "1": [4,6,4,4,4,4,14],
  "2": [14,1,1,14,16,16,14],
  "3": [14,1,1,14,1,1,14],
  "4": [17,17,17,31,1,1,1],
  "6": [14,16,16,15,17,17,14],
  "A": [14,17,17,31,17,17,17],
  "B": [30,17,17,30,17,17,30],
  "C": [14,17,16,16,16,17,14],
  "D": [30,17,17,17,17,17,30],
  "E": [31,16,16,28,16,16,31],
  "F": [31,16,16,28,16,16,16],
  "G": [14,17,16,22,17,17,14],
  "H": [17,17,17,31,17,17,17],
  "I": [31,4,4,4,4,4,31],
  "K": [17,18,20,24,20,18,17],
  "L": [16,16,16,16,16,17,30],
  "M": [17,27,21,21,17,17,17],
  "N": [17,25,20,18,17,17,17],
  "O": [14,17,17,17,17,17,14],
  "P": [30,17,17,30,16,16,16],
  "R": [30,17,17,30,18,20,17],
  "S": [14,16,16,14,1,1,14],
  "T": [31,4,4,4,4,4,4],
  "U": [17,17,17,17,17,17,14],
  "V": [17,17,17,21,10,10,4],
  "W": [17,17,21,21,21,21,14],
  "X": [17,17,10,4,10,17,17],
  "Y": [17,17,10,4,4,4,4],
  "Z": [31,1,2,4,8,16,31],
};

function setPixel(x:number,y:number,r:number,g:number,b:number,a:number){
  if(x<0||x>=W||y<0||y>=H) return;
  const p=(y*W+x)*4;
  fb[p]=r; fb[p+1]=g; fb[p+2]=b; fb[p+3]=a;
}
function fillRect(x:number,y:number,w:number,h:number,r:number,g:number,b:number,a:number){
  for(let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++) setPixel(xx,yy,r,g,b,a);
}
function drawChar(ch:string,x:number,y:number,scale:number,r:number,g:number,b:number){
  const rows = FONT[ch];
  if(!rows) return;
  for(let ry=0; ry<7; ry++){
    const row = rows[ry];
    for(let bx=0; bx<5; bx++){
      if(row & (1 << (4-bx))){
        for(let dy=0; dy<scale; dy++) for(let dx=0; dx<scale; dx++){
          setPixel(x+bx*scale+dx, y+ry*scale+dy, r,g,b,255);
        }
      }
    }
  }
}
function drawText(text:string,x:number,y:number,scale:number,r:number,g:number,b:number){
  let cx=x;
  for(const ch of text){
    if(ch===" "){ cx += 6*scale; continue; }
    drawChar(ch,cx,y,scale,r,g,b);
    cx += 6*scale;
  }
}

const NAVY = [10,20,45];
const stories = [
  { tag: "SUMMIT", head: "TRUMP XI PUTIN SIGN PEACE PACT", sub: "DECLARATION AFTER SHENZHEN SUMMIT" },
  { tag: "UKRAINE", head: "UK SENDS 1000 DRONES", sub: "260 MILLION POUND AID PACKAGE" },
  { tag: "CYBER", head: "US CYBER CHIEF FIRED", sub: "AFTER NATIONWIDE OUTAGES" },
  { tag: "TECH", head: "ANTHROPIC SOARS 34 PERCENT", sub: "2 TRILLION DOLLAR DEBUT" },
  { tag: "EUROPE", head: "UK-EU YOUTH DEAL AGREED", sub: "MOBILITY SCHEME SEALED" },
];

const crcTable = new Uint32Array(256);
for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = (c&1)?((0xEDB88320 ^ (c>>>1))>>>0):(c>>>1); crcTable[n]=c>>>0; }
function crc32(data:Buffer):number{
  let crc = 0xFFFFFFFF >>> 0;
  for(let i=0;i<data.length;i++) crc = ((crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF]) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function adler32(data:Buffer):number{
  let a = 1, b = 0;
  const MOD = 65521;
  for(let i=0;i<data.length;i++){
    a = (a + data[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function encodePNG(w:number,h:number,pixels:Uint8Array):Buffer{
  const rowBytes = w*4+1;
  const rawLen = rowBytes*h;
  const raw = Buffer.alloc(rawLen);
  let off=0;
  for(let y=0;y<h;y++){
    raw[off++]=0;
    for(let x=0;x<w;x++){
      const p=(y*w+x)*4;
      raw[off++]=pixels[p];
      raw[off++]=pixels[p+1];
      raw[off++]=pixels[p+2];
      raw[off++]=pixels[p+3];
    }
  }
  const deflate = deflateRawSync(raw);
  const adler = adler32(raw);
  const idat = Buffer.concat([
    Buffer.from([0x78,0x9c]),
    deflate,
    Buffer.from([(adler>>>24)&0xff,(adler>>>16)&0xff,(adler>>>8)&0xff,adler&0xff]),
  ]);
  const chunks: Buffer[] = [];
  function chunk(type:string,data:Buffer){
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length,0);
    const crcBuf = Buffer.concat([Buffer.from(type,"ascii"),data]);
    const crcb = Buffer.alloc(4); crcb.writeUInt32BE(crc32(crcBuf)>>>0,0);
    chunks.push(len, Buffer.from(type,"ascii"), data, crcb);
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  chunk("IHDR",ihdr);
  chunk("IDAT",idat);
  chunk("IEND",Buffer.alloc(0));
  return Buffer.concat([sig,...chunks]);
}

const pad = 24;
fillRect(0,0,W,H,255,255,255,255);

// header
drawText("FRIDAY 20 NOVEMBER 2026", pad, pad, 3, 0,0,0);
// masthead
drawText("THE DAILY RECORD", pad, pad+64, 5, 10,20,45);

// lead panel
const lx = pad, ly = pad+116, lw = W-2*pad, lh = 300;
fillRect(lx,ly,lw,lh,NAVY[0],NAVY[1],NAVY[2],255);
drawText("SUMMIT", lx+20, ly+20, 3, 255,255,255);
drawText(stories[0].head, lx+20, ly+80, 5, 255,255,255);
drawText(stories[0].sub, lx+20, ly+160, 2, 200,200,200);

// four panels in 2x2 grid via loop
const pw = (W-3*pad)/2, ph = 230;
const gx = [pad, pad+pw+pad];
const gy = [ly+lh+pad, ly+lh+pad+ph+pad];
for(let i=0;i<4;i++){
  const s = stories[1+i];
  const bx = gx[i%2], by = gy[Math.floor(i/2)];
  fillRect(bx,by,pw,ph,240,240,245,255);
  drawText(s.tag, bx+12, by+14, 2, 10,20,45);
  drawText(s.head, bx+12, by+44, 2, 0,0,0);
  drawText(s.sub, bx+12, by+90, 2, 80,80,80);
}

// write
const outDir = process.env.MAKEFUN_OUTPUT_DIR || process.argv[2] || "out";
const png = encodePNG(W,H,fb);
writeFileSync(outDir+"/entry.png", png);
console.log("wrote "+outDir+"/entry.png "+png.length+" bytes");
