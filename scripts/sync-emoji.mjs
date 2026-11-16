// Regenerates api/_emoji.js (server copy of the emoji rules) from the app's TypeScript source.
import {stripTypeScriptTypes} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';
const src=process.argv[2]??'../project/src/lib/market-emoji.ts';
writeFileSync('api/_emoji.js','// GENERATED from project/src/lib/market-emoji.ts (node scripts/sync-emoji.mjs). Do not edit by hand.\n'+stripTypeScriptTypes(readFileSync(src,'utf8'),{mode:'strip'}));
