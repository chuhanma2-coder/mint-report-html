import fs from "node:fs";
import zlib from "node:zlib";

const table = (() => {
  const values = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    values[index] = value >>> 0;
  }
  return values;
})();

export function crc32(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function safeName(name) {
  const normalized = String(name).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) throw new Error(`Unsafe package path: ${name}`);
  return normalized;
}

export function createZip(entries) {
  const files = [...entries].map((entry) => ({ name: safeName(entry.name), data: Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data) }));
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8"), crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18); local.writeUInt32LE(file.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, file.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20); central.writeUInt32LE(file.data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const centralBytes = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, end]);
}

export function readZip(input) {
  const bytes = Buffer.isBuffer(input) ? input : fs.readFileSync(input), files = new Map();
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6), method = bytes.readUInt16LE(offset + 8), expectedCrc = bytes.readUInt32LE(offset + 14);
    const packedSize = bytes.readUInt32LE(offset + 18), unpackedSize = bytes.readUInt32LE(offset + 22), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    if (flags & 0x0008) throw new Error("ZIP data descriptors are not supported");
    const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength;
    const name = safeName(bytes.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    const packed = bytes.subarray(dataStart, dataStart + packedSize);
    const data = method === 0 ? Buffer.from(packed) : method === 8 ? zlib.inflateRawSync(packed) : (() => { throw new Error(`Unsupported ZIP compression method ${method}`); })();
    if (data.length !== unpackedSize || crc32(data) !== expectedCrc) throw new Error(`Corrupt package entry: ${name}`);
    if (files.has(name)) throw new Error(`Duplicate package entry: ${name}`);
    files.set(name, data);
    offset = dataStart + packedSize;
  }
  if (!files.size) throw new Error("Not a readable Mint ZIP package");
  return files;
}

