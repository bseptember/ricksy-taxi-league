// Batch image generator (dev tool).
// usage: node tools/zai_batch.mjs
//
// PROVIDER: OpenRouter by default. The z.ai account is a CODING PLAN key —
// text works on /api/coding/paas/v4 but images return error 1113 (no image
// resource package). This tool refuses to touch the z.ai image endpoint unless
// IMAGE_PROVIDER=zai is set explicitly, and it does NOT retry a 1113/quota
// error — that was burning minutes on a dead endpoint.
import fs from 'fs';

const jobs = JSON.parse(fs.readFileSync('tools/art-jobs.json', 'utf8'));
const provider = process.env.IMAGE_PROVIDER || 'openrouter';
const OR_KEY = process.env.OPENROUTER_API_KEY;
const ZAI_KEY = process.env.ZAI_API_KEY;

/* OpenRouter image_config takes an ASPECT RATIO ("1:1"), not pixel dims. */
const RATIOS = { '1:1': 1, '2:3': 2 / 3, '3:2': 3 / 2, '3:4': 3 / 4, '4:3': 4 / 3, '4:5': 4 / 5, '5:4': 5 / 4, '9:16': 9 / 16, '16:9': 16 / 9, '4:1': 4, '1:4': 0.25, '8:1': 8, '1:8': 0.125 };
function nearestRatio(size) {
  const [w, h] = String(size || '1024x1024').split('x').map(Number);
  if (!w || !h) return '1:1';
  const target = w / h;
  let best = '1:1', bestD = Infinity;
  for (const [r, v] of Object.entries(RATIOS)) {
    const d = Math.abs(v - target);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

async function viaOpenRouter(prompt, size) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OR_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ricksytaxi.imidlalo.co.za',
      'X-Title': 'Ricksy Taxi League art pipeline',
    },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: nearestRatio(size) },
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${JSON.stringify(j).slice(0, 240)}`);
  const b64 = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!b64) throw new Error('no image in response');
  const raw = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  return Buffer.from(raw, 'base64');
}

async function viaZai(prompt, size) {
  const res = await fetch('https://api.z.ai/api/paas/v4/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ZAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.ZAI_MODEL || 'glm-image', prompt, size }),
  });
  const j = await res.json();
  if (!j.data?.[0]?.url) {
    const msg = JSON.stringify(j).slice(0, 200);
    if (/1113|resource package/i.test(msg)) {
      throw new Error('ZAI_NO_IMAGE_PACKAGE: coding-plan key has no image quota');
    }
    throw new Error(msg);
  }
  const img = await fetch(j.data[0].url);
  return Buffer.from(await img.arrayBuffer());
}

async function gen(job) {
  const fn = provider === 'zai' ? viaZai : viaOpenRouter;
  try {
    const buf = await fn(job.prompt, job.size || '1024x1024');
    fs.writeFileSync(job.out, buf);
    return `OK ${job.out} ${buf.length}b`;
  } catch (e) {
    if (/ZAI_NO_IMAGE_PACKAGE|1113/i.test(e.message)) {
      return `SKIP ${job.out} — z.ai has no image package; re-run with OpenRouter`;
    }
    return `ERR ${job.out} ${e.message}`;
  }
}

if (provider === 'zai' && !ZAI_KEY) {
  console.error('IMAGE_PROVIDER=zai but ZAI_API_KEY is not set.');
  process.exit(1);
}
if (provider !== 'zai' && !OR_KEY) {
  console.error('OPENROUTER_API_KEY is not set. Export it, or set IMAGE_PROVIDER=zai after adding a z.ai image package.');
  process.exit(1);
}

let done = 0;
for (const job of jobs) {
  if (fs.existsSync(job.out) && !process.env.FORCE) { console.log(`SKIP ${job.out} (exists)`); done++; continue; }
  console.log('GEN:', job.out);
  console.log('  ', await gen(job));
  done++;
  if (done < jobs.length) await new Promise(r => setTimeout(r, 3000));
}
console.log('batch complete');
