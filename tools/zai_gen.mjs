// Image generation helper (dev tool).
// usage: node tools/zai_gen.mjs "prompt" outFile [size]
//
// PROVIDER: OpenRouter by default. The z.ai account is a CODING PLAN key —
// text works on /api/coding/paas/v4 but image generation returns error 1113
// ("no image resource package"). Never retry the z.ai image endpoint; to use
// z.ai for art again, add an image resource package and re-enable ZAI_IMAGE=1.
const fs = await import('fs');

const prompt = process.argv[2];
const outFile = process.argv[3];
const size = process.argv[4] || '1024x1024';
if (!prompt || !outFile) {
  console.error('usage: node tools/zai_gen.mjs "prompt" outFile [size]');
  process.exit(1);
}

const [w, h] = size.split('x').map(Number);
const provider = process.env.IMAGE_PROVIDER || 'openrouter';

/* OpenRouter's image_config takes an ASPECT RATIO ("1:1"), not pixel dims.
   Map the nearest supported ratio so callers can keep asking for 1024x1024. */
const RATIOS = { '1:1': 1, '2:3': 2 / 3, '3:2': 3 / 2, '3:4': 3 / 4, '4:3': 4 / 3, '4:5': 4 / 5, '5:4': 5 / 4, '9:16': 9 / 16, '16:9': 16 / 9, '4:1': 4, '1:4': 0.25, '8:1': 8, '1:8': 0.125 };
function nearestRatio() {
  if (!w || !h) return '1:1';
  const target = w / h;
  let best = '1:1', bestD = Infinity;
  for (const [r, v] of Object.entries(RATIOS)) {
    const d = Math.abs(v - target);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
const aspect = nearestRatio();

async function viaOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const model = process.env.IMAGE_MODEL || 'google/gemini-2.5-flash-image';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ricksytaxi.imidlalo.co.za',
      'X-Title': 'Ricksy Taxi League art pipeline',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: aspect },
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const msg = j.choices?.[0]?.message;
  const b64 = msg?.images?.[0]?.image_url?.url;
  if (!b64) throw new Error('no image in response: ' + JSON.stringify(j).slice(0, 300));
  const raw = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  return Buffer.from(raw, 'base64');
}

async function viaZai() {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw new Error('ZAI_API_KEY not set');
  const res = await fetch('https://api.z.ai/api/paas/v4/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.ZAI_MODEL || 'glm-image', prompt, size }),
  });
  const j = await res.json();
  if (!j.data?.[0]?.url) throw new Error('zai: ' + JSON.stringify(j).slice(0, 300));
  const img = await fetch(j.data[0].url);
  return Buffer.from(await img.arrayBuffer());
}

try {
  const buf = provider === 'zai' ? await viaZai() : await viaOpenRouter();
  fs.writeFileSync(outFile, buf);
  console.log('SAVED', outFile, buf.length, 'bytes', `(${provider}, ${w}x${h})`);
} catch (e) {
  console.error('GEN-ERR', e.message);
  if (/1113|resource package|insufficient/i.test(e.message)) {
    console.error('hint: z.ai coding-plan keys have no image quota — use OpenRouter (default) or add a z.ai image package.');
  }
  process.exit(1);
}
