// z.ai batch generator with rate-limit backoff (dev tool)
// usage: ZAI_API_KEY=... node tools/zai_batch.mjs
import fs from 'fs';
const KEY = process.env.ZAI_API_KEY;
const jobs = JSON.parse(fs.readFileSync('tools/art-jobs.json', 'utf8'));

async function gen(prompt, outFile, size = '1024x1024', tries = 6) {
  for (let a = 1; a <= tries; a++) {
    try {
      const res = await fetch('https://api.z.ai/api/paas/v4/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.ZAI_MODEL || 'glm-image', prompt, size })
      });
      const j = await res.json();
      if (j.data && j.data[0] && j.data[0].url) {
        const img = await fetch(j.data[0].url);
        const buf = Buffer.from(await img.arrayBuffer());
        fs.writeFileSync(outFile, buf);
        return `OK ${outFile} ${buf.length}b`;
      }
      if (j.error && String(j.error.code) === '1302') {
        console.log(`  rate-limited, wait 45s (attempt ${a}/${tries})`);
        await new Promise(r => setTimeout(r, 45000));
        continue;
      }
      return `ERR ${outFile} ${JSON.stringify(j).slice(0, 200)}`;
    } catch (e) {
      console.log(`  fetch fail: ${e.message}, retry in 15s`);
      await new Promise(r => setTimeout(r, 15000));
    }
  }
  return `GAVE-UP ${outFile}`;
}

for (const job of jobs) {
  if (fs.existsSync(job.out) && !process.env.FORCE) { console.log(`SKIP ${job.out} (exists)`); continue; }
  console.log('GEN:', job.out);
  console.log('  ', await gen(job.prompt, job.out, job.size));
  await new Promise(r => setTimeout(r, 20000)); // spacing between calls
}
console.log('batch complete');
