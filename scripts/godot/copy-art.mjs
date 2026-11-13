// GODOT-4: the survivors' portraits for the Godot UI (copied from public/portraits; generated, not committed).
import fs from 'node:fs';
fs.mkdirSync('godot/assets/portraits', { recursive: true });
let n = 0;
for (const f of fs.readdirSync('public/portraits')) if (f.endsWith('.png')) { fs.copyFileSync(`public/portraits/${f}`, `godot/assets/portraits/${f}`); n++; }
console.log(`copied ${n} portraits`);
