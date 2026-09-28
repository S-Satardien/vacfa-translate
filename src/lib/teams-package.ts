/**
 * Zero-dependency Microsoft Teams App Package (.zip) Generator.
 * 
 * Microsoft Teams requires a .zip package containing:
 *  - manifest.json
 *  - color.png (192x192)
 *  - outline.png (32x32)
 * 
 * This module generates a valid PKZIP binary archive directly in the browser
 * with zero external dependencies and triggers instant download.
 */

// Precomputed CRC-32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

/**
 * Computes standard CRC-32 checksum for a Uint8Array.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a valid uncompressed (Store) ZIP archive from a list of files.
 */
function createZipArchive(files: ZipEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const size = file.data.length;
    const checksum = crc32(file.data);

    // 1. Local File Header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local header signature
    lv.setUint16(4, 20, true);         // Version needed to extract (2.0)
    lv.setUint16(6, 0, true);          // General purpose bit flag
    lv.setUint16(8, 0, true);          // Compression method (0 = store)
    lv.setUint16(10, dosTime, true);   // Last mod file time
    lv.setUint16(12, dosDate, true);   // Last mod file date
    lv.setUint32(14, checksum, true);  // CRC-32
    lv.setUint32(18, size, true);      // Compressed size
    lv.setUint32(22, size, true);      // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader);
    localHeaders.push(file.data);

    // 2. Central Directory Header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed to extract
    cv.setUint16(8, 0, true);          // Flags
    cv.setUint16(10, 0, true);         // Compression method (0 = store)
    cv.setUint16(12, dosTime, true);   // Time
    cv.setUint16(14, dosDate, true);   // Date
    cv.setUint32(16, checksum, true);  // CRC-32
    cv.setUint32(20, size, true);      // Compressed size
    cv.setUint32(24, size, true);      // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // Name length
    cv.setUint16(30, 0, true);         // Extra field length
    cv.setUint16(32, 0, true);         // File comment length
    cv.setUint16(34, 0, true);         // Disk number start
    cv.setUint16(36, 0, true);         // Internal file attributes
    cv.setUint32(38, 0, true);         // External file attributes
    cv.setUint32(42, offset, true);    // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + file.data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    centralDirSize += ch.length;
  }

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true);          // Disk number
  ev.setUint16(6, 0, true);          // Disk where central dir starts
  ev.setUint16(8, files.length, true);  // Number of central dir records on disk
  ev.setUint16(10, files.length, true); // Total central dir records
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, centralDirOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true);         // Comment length

  // Combine all parts
  let totalLength = 0;
  for (const part of [...localHeaders, ...centralHeaders, eocd]) {
    totalLength += part.length;
  }

  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of [...localHeaders, ...centralHeaders, eocd]) {
    result.set(part, pos);
    pos += part.length;
  }

  return result;
}

/**
 * Fetches the manifest and icons from public assets, builds the ZIP,
 * and triggers immediate client-side download of `vacfa-teams-app.zip`.
 */
export async function downloadTeamsAppPackage(): Promise<void> {
  const basePath = process.env.NODE_ENV === 'production' ? '/vacfa-translate' : '';

  try {
    // 1. Direct download if pre-built static archive is accessible
    try {
      const staticRes = await fetch(`${basePath}/teams/vacfa-teams-app.zip`);
      if (staticRes.ok) {
        const blob = await staticRes.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'vacfa-teams-app.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        return;
      }
    } catch {
      // Fall through to in-memory zip generator
    }

    const [manifestRes, colorRes, outlineRes] = await Promise.all([
      fetch(`${basePath}/teams/manifest.json`),
      fetch(`${basePath}/teams/color.png`),
      fetch(`${basePath}/teams/outline.png`),
    ]);

    const manifestText = await manifestRes.text();
    const manifestBytes = new TextEncoder().encode(manifestText);

    const colorBlob = await colorRes.blob();
    const colorBytes = new Uint8Array(await colorBlob.arrayBuffer());

    const outlineBlob = await outlineRes.blob();
    const outlineBytes = new Uint8Array(await outlineBlob.arrayBuffer());

    const files: ZipEntry[] = [
      { name: 'manifest.json', data: manifestBytes },
      { name: 'color.png', data: colorBytes },
      { name: 'outline.png', data: outlineBytes },
    ];

    const zipData = createZipArchive(files);
    const zipBlob = new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });

    const downloadUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'vacfa-teams-app.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } catch (err: any) {
    throw new Error('Failed to generate Teams app package: ' + (err?.message || 'Network error'));
  }
}
