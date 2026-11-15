// Regenerates the website header/footer copy used on the sign-in screens.
// Usage: node scripts-gen-site-chrome.cjs /path/to/site   (needs `postcss` resolvable)
const fs = require('fs'); const path = require('path');
const site = process.argv[2] || '/home/claude/site';
const postcss = require(process.env.POSTCSS_PATH || 'postcss');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const abs = s => s.replace(/(href|src)="(?!https?:|#|mailto:|tel:)([^"]*)"/g, (m, a, v) => `${a}="https://soilpassport.com/${v.replace(/^\.?\//, '')}"`)
  .replace(/https:\/\/soilpassport\.com\/assets\/logo\.png/g, '/logo.png');
let header = html.match(/<header class="site">[\s\S]*?<\/header>/)[0];
let footer = html.match(/<footer class="site">[\s\S]*?<\/footer>/)[0];
footer = footer.replace(/<a href="#" id="cookie-settings">[^<]*<\/a>\s*/, '').replace(/<a href="[^"]*" class="staff-link"[^>]*>[^<]*<\/a>\s*/, '');
header = header.replace(/<a href="[^"]*" class="staff-link"[^>]*>[^<]*<\/a>\s*/g, '');
fs.writeFileSync(path.join(__dirname, 'src/components/siteChrome.generated.ts'),
  `// GENERATED from the website by scripts-gen-site-chrome.cjs. Do not edit by hand.\nexport const SITE_HEADER = ${JSON.stringify(abs(header))};\nexport const SITE_FOOTER = ${JSON.stringify(abs(footer))};\n`);
const KEEP = /^(header\.site|footer\.site|footer \.bottom|\.nav|\.navlinks|\.hamburger|\.social-links|\.brand|\.mark|\.wrap|\.btn|\.btn-link|\.staff-link|header\.site \.nav-cta|footer\b)/;
const css = fs.readFileSync(path.join(site, 'assets/style.css'), 'utf8');
const root = postcss.parse(css); let out = '';
const vars = root.nodes.find(n => n.type === 'rule' && n.selector === ':root');
out += '.spweb{' + vars.nodes.map(d => d.toString()).join(';') + ';font-family:var(--sans);line-height:1.55;color:var(--ink)}\n';
out += '.spweb a{text-decoration:none;color:inherit}.spweb *,.spweb *::before,.spweb *::after{box-sizing:border-box}.spweb img{max-width:100%;display:block}.spweb button{font:inherit}\n';
function pre(sel) { return sel.split(',').map(s => s.trim()).filter(s => KEEP.test(s)).map(s => '.spweb ' + s).join(','); }
function walk(nodes) { let o = '';
  for (const n of nodes) {
    if (n.type === 'rule') { const s = pre(n.selector); if (s) o += s + '{' + n.nodes.map(d => d.toString()).join(';') + '}\n'; }
    else if (n.type === 'atrule' && n.name === 'media') { const i = walk(n.nodes); if (i) o += '@media ' + n.params + '{' + i + '}\n'; }
  } return o; }
out += walk(root.nodes);
fs.writeFileSync(path.join(__dirname, 'src/siteChrome.css'), out);
console.log('chrome css bytes', out.length);
