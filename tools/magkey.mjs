/* Magenta-key: remove the solid magenta background from AI art, crop to
   content bbox, output clean RGBA sprite. usage:
   node tools/magkey.mjs in.png out.png [tolerance=90] */
import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';

const [inp, outp] = process.argv.slice(2);
const tol = parseInt(process.argv[4] || '90', 10);
if (!inp || !outp) { console.error('usage: node tools/magkey.mjs in.png out.png [tol]'); process.exit(1); }

const img = await loadImage(inp);
const cv = createCanvas(img.width, img.height);
const ctx = cv.getContext('2d');
ctx.drawImage(img, 0, 0);
const im = ctx.getImageData(0, 0, cv.width, cv.height);
const d = im.data;

// sample corner color as the key
const key = [d[0], d[1], d[2]];
let minX = cv.width, minY = cv.height, maxX = 0, maxY = 0;
for (let i = 0; i < d.length; i += 4) {
  const dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2];
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  if (dist < tol) {
    d[i + 3] = 0; // transparent
  } else if (d[i + 3] > 0) {
    const x = (i / 4) % cv.width, y = Math.floor(i / 4 / cv.width);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
ctx.putImageData(im, 0, 0);
// crop to content with 4px pad
const pad = 4;
const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
const cw = Math.min(cv.width - cx, maxX - minX + pad * 2 + 1);
const ch = Math.min(cv.height - cy, maxY - minY + pad * 2 + 1);
const out = createCanvas(cw, ch);
out.getContext('2d').drawImage(cv, cx, cy, cw, ch, 0, 0, cw, ch);
fs.writeFileSync(outp, out.toBuffer('image/png'));
console.log('KEYED', outp, cw + 'x' + ch, 'key=rgb(' + key.join(',') + ')');
