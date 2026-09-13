import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const source = files.filter((file) => /\.(ts|tsx|js|mjs|json|rules|md)$/.test(file) && !file.startsWith('node_modules/'));
const patterns = [
  ['firebase-import', /from ['"]firebase(?:\/[^'"]*)?['"]|from ['"]firebase-admin(?:\/[^'"]*)?['"]/g],
  ['firestore-api', /getFirestore|collectionGroup|runTransaction|writeBatch|getDocs|getDoc|setDoc|updateDoc|deleteDoc/g],
  ['firebase-auth', /signInWithEmailAndPassword|createUserWithEmailAndPassword|sendPasswordResetEmail|onAuthStateChanged|getIdToken|verifyIdToken/g],
  ['firebase-storage', /firebase\/storage|uploadBytes|getDownloadURL|deleteObject/g],
  ['firebase-admin-db', /getAdminDb|firebase-admin\/firestore/g],
];
const collectionNames = new Map();
const hits = [];
for (const file of source) {
  let text;
  try { text = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { continue; }
  for (const [name, pattern] of patterns) {
    const matches = text.match(pattern) || [];
    if (matches.length) hits.push({ file, name, count: matches.length, samples: [...new Set(matches)].slice(0, 12) });
  }
  for (const match of text.matchAll(/collection\(\s*['"]([^'"]+)['"]|collectionGroup\(\s*['"]([^'"]+)['"]/g)) {
    const name = match[1] || match[2];
    collectionNames.set(name, (collectionNames.get(name) || 0) + 1);
  }
}
const byCategory = {};
for (const hit of hits) (byCategory[hit.name] ||= []).push(hit);
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), counts: Object.fromEntries(Object.entries(byCategory).map(([name, values]) => [name, { files: values.length, matches: values.reduce((sum, item) => sum + item.count, 0) }])), collectionNames: Object.fromEntries([...collectionNames.entries()].sort()), hits }, null, 2));
