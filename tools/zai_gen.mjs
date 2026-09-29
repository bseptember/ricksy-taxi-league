// z.ai CogView image generation helper (dev tool)
// usage: node tools/zai_gen.mjs "prompt" outFile [size]
const KEY = process.env.ZAI_API_KEY;
const prompt = process.argv[2];
const outFile = process.argv[3];
const size = process.argv[4] || '1024x1024';
if (!KEY || !prompt || !outFile) { console.error('usage: node tools/zai_gen.mjs "prompt" outFile [size]'); process.exit(1); }
const res = await fetch('https://api.z.ai/api/paas/v4/images/generations', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: process.env.ZAI_MODEL || 'glm-image', prompt, size })
});
const j = await res.json();
if (j.data && j.data[0] && j.data[0].url) {
  const img = await fetch(j.data[0].url);
  const buf = Buffer.from(await img.arrayBuffer());
  const fs = await import('fs');
  fs.writeFileSync(outFile, buf);
  console.log('SAVED', outFile, buf.length, 'bytes');
} else {
  console.error('API-ERR', JSON.stringify(j).slice(0, 300));
  process.exit(1);
}
