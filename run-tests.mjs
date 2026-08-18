// Headless runner for tests.html — extracts the inline scripts and runs them
// against a minimal DOM stub. Usage: node run-tests.mjs
import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync(new URL('./tests.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const data = fs.readFileSync(new URL('./data.js', import.meta.url), 'utf8');

const node = () => ({
  className: '', textContent: '', style: {}, children: [],
  appendChild(c) { this.children.push(c); }
});
const document = { getElementById: () => node(), createElement: () => node() };

const ctx = vm.createContext({ document, console });
vm.runInContext(data, ctx);
// `const`/`let` in the page script stay lexically scoped, so hand the results
// out through globalThis explicitly.
scripts.forEach((s, i) => {
  const tail = i === scripts.length - 1 ? '\nglobalThis.__results = { passes, fails, suites };' : '';
  vm.runInContext(s + tail, ctx);
});

const { passes, fails, suites } = ctx.__results;
for (const s of suites) {
  for (const t of s.tests) {
    if (!t.pass) console.log(`FAIL  ${s.name} :: ${t.name} — ${t.error}`);
  }
}
console.log(`${passes + fails} tests — ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
