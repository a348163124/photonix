import { writeFileSync, readFileSync } from "fs";

// Read the PNG we already generated
const png = readFileSync("src-tauri/icons/32x32.png");

// ICO format: header + directory entry + PNG data
// ICO header: 6 bytes
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);  // reserved
header.writeUInt16LE(1, 2);  // type: 1 = ICO
header.writeUInt16LE(1, 4);  // number of images

// Directory entry: 16 bytes
const entry = Buffer.alloc(16);
entry[0] = 32;   // width (0 means 256)
entry[1] = 32;   // height
entry[2] = 0;    // color palette
entry[3] = 0;    // reserved
entry.writeUInt16LE(1, 4);   // color planes
entry.writeUInt16LE(32, 6);  // bits per pixel
entry.writeUInt32LE(png.length, 8);  // size of image data
entry.writeUInt32LE(22, 12); // offset to image data (6 + 16 = 22)

const ico = Buffer.concat([header, entry, png]);
writeFileSync("src-tauri/icons/icon.ico", ico);
console.log("ICO generated successfully");
