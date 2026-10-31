// CI (round 10): waits until the live site serves this commit's build — /calendar/version.json at the gauntlet's
// address naming the commit — so the live e2e that follows tests what was just pushed. ~10 min at most; exits 1 then.
// Usage: npx tsx scripts/wait-live.ts <commit sha> [site]

export {};

const [sha, site = 'https://gauntlet-home.vercel.app'] = process.argv.slice(2);
if (!sha) throw new Error('usage: wait-live.ts <commit sha> [site]');
const want = sha.slice(0, 7);
for (let i = 1; i <= 40; i++) {
  let live = '';
  try {
    const res = await fetch(`${site}/calendar/version.json?wait=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    live = res.ok ? String(((await res.json()) as { commit?: string }).commit) : `HTTP ${res.status}`;
  } catch (e) {
    live = `error: ${(e as Error).message}`;
  }
  if (live === want) {
    console.log(`${site}/calendar/ serves ${want} (attempt ${i})`);
    process.exit(0);
  }
  console.log(`attempt ${i}/40: live ${live}, waiting for ${want}`);
  await new Promise((r) => setTimeout(r, 15_000));
}
console.error(`::error::${site}/calendar/ did not serve ${want} within 10 minutes`);
process.exit(1);
