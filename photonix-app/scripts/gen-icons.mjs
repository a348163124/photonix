import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";

// Generate a minimal 32x32 blue PNG
const w = 32, h = 32;
const raw = Buffer.alloc((w * 4 + 1) * h);
for (let y = 0; y < h; y++) {
  raw[y * (w * 4 + 1)] = 0; // filter byte
  for (let x = 0; x < w; x++) {
    const i = y * (w * 4 + 1) + 1 + x * 4;
    raw[i] = 30;     // R
    raw[i + 1] = 64; // G
    raw[i + 2] = 175; // B
    raw[i + 3] = 255; // A
  }
}

const deflated = deflateSync(raw);

// CRC32 table
const crc32Table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crc32Table[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crcVal = crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([len, typeAndData, crcBuf]);
}

function makePng(width, height, compressedData) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdr = makeChunk("IHDR", ihdrData);
  const idat = makeChunk("IDAT", compressedData);
  const iend = makeChunk("IEND", Buffer.alloc(0));
  
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const png = makePng(w, h, deflated);

mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/32x32.png", png);
writeFileSync("src-tauri/icons/128x128.png", png);
writeFileSync("src-tauri/icons/128x128@2x.png", png);
writeFileSync("src-tauri/icons/icon.icns", png);
writeFileSync("src-tauri/icons/icon.ico", png);

console.log("Icons generated successfully");
