// Assembles the Vercel output: the static public pages at the root and the React web app under /app/.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const out = 'dist';
const staticEntries = ['index.html', 'styles.css', 'site.js', 'assets', 'privacy', 'terms', 'delete-account', '.well-known'];

execSync('npm ci --no-audit --no-fund', { cwd: 'web', stdio: 'inherit' });
execSync('npm run build', { cwd: 'web', stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const entry of staticEntries) {
  if (!existsSync(entry)) throw new Error(`Missing static entry: ${entry}`);
  cpSync(entry, `${out}/${entry}`, { recursive: true });
}
cpSync('web/dist', `${out}/app`, { recursive: true });
console.log('Site assembled in dist/ (static pages + /app/)');
