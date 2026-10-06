import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const docFiles = ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md'];
const templateRoot = fileURLToPath(new URL('../', import.meta.url));
const publicCommit = '9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554';
const initialCommit = '19ccd4cae07c820917b4c028a649cb87972c4516';
const sourceUrl = 'https://github.com/tech-progress/logto-b2b-identity';
const marketplaceHeadings = [
  '# Deploy and Host Logto B2B Identity on Railway',
  '## About Hosting Logto',
  '## Why Deploy Logto with this recipe',
  '## Common Use Cases',
  '## Dependencies for Logto B2B Identity',
  '### Deployment Dependencies',
];
const qualificationGates = ['Genuine browser owner setup', 'Native authorization code + PKCE',
  'Organization allow/deny authorization', 'Owner/account recovery', 'Fresh PostgreSQL restore',
  'Live HTTPS and stored-template qualification'];

const shippedLinkFiles = [...docFiles, 'LICENSE_REVIEW.md', 'LICENSE', 'VERSION', 'CHANGELOG.md',
  'marketplace-metadata.json', 'template-defaults.json', 'template-descriptions.json',
  'template-networking.json', 'template-volumes.json', '.env.example', 'compose.yaml',
  'Dockerfile', 'gateway.Dockerfile', 'package.json', 'package-lock.json',
  'scripts/verify-docs.mjs', 'scripts/verify.sh', 'scripts/smoke.sh',
  'scripts/restore-template-draft.sh', 'scripts/audit-template.sh', 'tests/docs.test.mjs'];
const publicHosts = new Set(['github.com', 'raw.githubusercontent.com', 'logto.io',
  'docs.logto.io', 'www.postgresql.org', 'nodejs.org']);

export function readDocBundle(root = templateRoot) {
  const read = file => readFileSync(resolve(root, file), 'utf8');
  return {
    docs: Object.fromEntries(docFiles.map(file => [file, read(file)])),
    version: read('VERSION').trim(),
    changelog: read('CHANGELOG.md'),
    metadata: JSON.parse(read('marketplace-metadata.json')),
    defaults: JSON.parse(read('template-defaults.json')),
    volumes: JSON.parse(read('template-volumes.json')),
    linkedFiles: Object.fromEntries([...new Set([...docFiles, 'CHANGELOG.md'].flatMap(file => linkTargets(read(file))))]
      .filter(target => !target.startsWith('#') && !/^[a-z][a-z\d+.-]*:/i.test(target))
      .map(target => {
        const path = decodeURIComponent(target.split(/[?#]/)[0]);
        assert.ok(shippedLinkFiles.includes(path), `Unshipped local doc link: ${target}`);
        return [path, read(path)];
      })),
  };
}

function linkTargets(markdown) {
  return [
    ...[...markdown.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)].map(match => match[1] || match[2]),
    ...[...markdown.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)].map(match => match[1]),
    ...[...markdown.matchAll(/<([a-z][a-z\d+.-]*:[^>\s]+)>/gi)].map(match => match[1]),
    ...[...markdown.replace(/```[\s\S]*?```|`[^`\n]*`/g, '').matchAll(/\bhttps?:\/\/[^\s<>"`)]+/gi)]
      .map(match => match[0].replace(/[.,;!?]+$/, '')),
    ...[...markdown.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]),
  ];
}

const plain = markdown => markdown.replace(/[*`]/g, '');
function requireText(text, pattern, label) {
  assert.match(text, pattern, label);
}

function verifyPublicContent(file, markdown, bundle) {
  const text = plain(markdown);
  assert.ok(!/FINDINGS\.md|(?:\/home\/|\.t3\/|\.verification\/|artifacts\/|localops|local-ops)|native-acceptance-summary\.json|(?:localImageSHA|testID)\s*[:=]/i.test(markdown),
    `${file}: private operational references must not ship`);
  assert.ok(!/Template version [`*]*1\.0\.[01]|current (?:public )?(?:source )?(?:release|version|source)(?: is|:)? (?:Recipe )?1\.0\.[01]|no (?:assumed )?distribution (?:repository|source)|no published[^.\n]*assumed distribution/i.test(text),
    `${file}: stale source/version claims`);
  const currentText = text.split('\n').filter(line => !line.startsWith('>')).join('\n');
  assert.ok(!/Recipe 1\.0\.2(?: is|,) staged|1\.0\.2[^\n]*Unreleased/i.test(currentText),
    `${file}: obsolete stage-only phase`);
  const falseClaims = /(?:^|[.\n])\s*(?:[-*]\s+)?(?:Recipe 1\.0\.2(?: source)? (?:is|has been) (?:published|released)|(?:Live qualification|All (?:identity |B2B )?gates) (?:is |are |have )?(?:complete|passed)|(?:This recipe|The review) (?:has |provides )?(?:full licensing\/security clearance|universal certification|assembled-image distribution clearance)|(?:(?:All )?Remote(?: identity| HTTPS| lifecycle)? (?:gates|qualification)|Railway(?: marketplace)? qualification|(?:Railway )?Marketplace(?: publication| release)?|Source push)(?: receipts?| status)?(?: (?:is|are|has been|have been))?\s*[:=]?\s*(?:PASS(?:ED)?|complete|qualified|published|released)|(?:Source|Publication|Push) receipt\s*[:=]\s*(?!PENDING|not asserted)\S+)/im;
  assert.ok(!/(?:This recipe|The review|Source review) (?:grants|provides|supplies) (?:new |full |unrestricted )?(?:binary distribution|assembled-image distribution|security certification)/i.test(text), `${file}: contradictory grant/certification expansion`);
  assert.ok(!falseClaims.test(text), `${file}: contradictory publication/qualification/clearance claim`);
  assert.ok(!/railway\.(?:com|app)\/(?:deploy|template)\//i.test(markdown), `${file}: no inferred marketplace deploy link`);
  for (const target of linkTargets(markdown)) {
    if (target.startsWith('#')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
      const url = new URL(target);
      assert.equal(url.protocol, 'https:', `${file}: public links use HTTPS`);
      assert.ok(publicHosts.has(url.hostname), `${file}: unknown/private external link ${url.hostname}`);
      assert.ok(!url.username && !url.password && !url.search, `${file}: links cannot carry credentials/query state`);
      if (url.origin === 'https://github.com' && url.pathname.startsWith('/tech-progress/logto-b2b-identity/commit/')) {
        assert.ok([publicCommit, initialCommit].includes(url.pathname.split('/').at(-1)), `${file}: no invented source commit receipt`);
      }
      const publicPath = decodeURIComponent(url.pathname);
      assert.ok(!/\/project\/|\/settings\/|\/artifacts\/|\/FINDINGS\.md|\/\.verification\//i.test(publicPath),
        `${file}: private control/evidence link`);
    } else {
      const path = decodeURIComponent(target.split(/[?#]/)[0]);
      assert.ok(shippedLinkFiles.includes(path), `${file}: unshipped local doc link ${target}`);
      assert.equal(typeof bundle.linkedFiles[path], 'string', `${file}: missing local link target ${path}`);
    }
  }
}

export function verifyDocs(bundle, { expectedVersion = bundle.version } = {}) {
  assert.ok(['1.0.1', '1.0.2'].includes(expectedVersion), 'Expected local version must be 1.0.1 or 1.0.2');
  assert.equal(bundle.version, expectedVersion, 'VERSION must match the explicitly selected local candidate');
  assert.equal(bundle.version, '1.0.2', 'Source-freeze phase selects Recipe 1.0.2');
  const releases = [...bundle.changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (?:\d{4}-\d{2}-\d{2}|Unreleased)$/gm)];
  assert.equal(releases[0]?.[1], bundle.version, 'Latest CHANGELOG entry must match VERSION');
  requireText(bundle.changelog, /^## \[1\.0\.2\] - 2026-10-06$/m, 'CHANGELOG: dated source-freeze candidate');
  requireText(bundle.changelog, /all ten local native acceptance gates/i, 'CHANGELOG: local acceptance');
  requireText(bundle.changelog, /harness/i, 'CHANGELOG: harness changes');
  requireText(bundle.changelog, /finite source-only/i, 'CHANGELOG: finite source review');
  requireText(bundle.changelog, /Remote[^\n]*PENDING/, 'CHANGELOG: remote gates pending');
  verifyPublicContent('CHANGELOG.md', bundle.changelog, bundle);
  assert.ok(releases.some(match => match[1] === '1.0.1'), 'Retain published 1.0.1 history');
  assert.ok(releases.some(match => match[1] === '1.0.0'), 'Retain initial 1.0.0 history');

  for (const file of docFiles) {
    const markdown = bundle.docs[file];
    assert.equal(typeof markdown, 'string', `${file} must exist`);
    const text = plain(markdown);
    requireText(text, /Source-only freeze candidate — 2026-10-06/, `${file}: source-freeze phase`);
    requireText(text, /Recipe 1\.0\.2 is selected for immutable source-only publication/, `${file}: selected 1.0.2 source status`);
    requireText(text, /^> Historical pre-live snapshot — 2026-10-06[^\n]*Recipe 1\.0\.1 was the public source release then/m, `${file}: explicitly historical 1.0.1 snapshot`);
    requireText(text, /publication targets, not a source-push receipt/, `${file}: no invented push receipt`);
    requireText(text, /All remote qualification and marketplace publication receipts remain PENDING/, `${file}: remote status pending`);
    assert.ok(linkTargets(markdown).includes(`${sourceUrl}/tree/v1.0.2`), `${file}: prospective immutable tag navigation`);
    requireText(text, /release-v1[^.\n]*prospective moving compatibility channel/, `${file}: prospective channel`);
    for (const version of ['1.44.0', '17.11', '22.23.3']) {
      assert.ok(text.includes(version), `${file}: pinned upstream ${version}`);
    }
    for (const [pattern, label] of [
      [/(?:passed[^.\n]*(?:all ten|ten-gate)|(?:all ten|ten-gate)[^.\n]*passed)/i, 'ten local acceptance passes'],
      [/owner/i, 'genuine owner gate'], [/native[^.\n]*PKCE/i, 'native PKCE gate'],
      [/organization[^.\n]*allow\/deny/i, 'organization allow/deny gate'],
      [/recovery/i, 'recovery gate'], [/fresh[^.\n]*restore/i, 'fresh restore gate'],
      [/pending/i, 'pending receipts'], [/receipts/i, 'qualification receipts'],
      [/source-only recipe review/i, 'finite source review'],
      [/artifact review|artifact-review worker/i, 'separate artifact review'],
      [/assembled-image distribution clearance/i, 'artifact clearance boundary'],
      [/full licensing\/security clearance/i, 'clearance boundary'],
      [/universal certification/i, 'certification boundary'],
      [/AGPL/, 'AGPL obligations'], [/ELv2/, 'ELv2 restrictions'],
      [/Artistic/, 'Artistic terms'], [/native/, 'native obligations'],
      [/SAML/, 'SAML exclusions'], [/Koa/, 'Koa advisory caveat'],
      [/5000 MB/, 'single volume capacity'], [/private/i, 'private services'],
    ]) requireText(text, pattern, `${file}: ${label}`);
    verifyPublicContent(file, markdown, bundle);
  }

  const readme = plain(bundle.docs['README.md']);
  const publishing = plain(bundle.docs['PUBLISHING.md']);
  assert.ok(linkTargets(bundle.docs['README.md']).includes(`${sourceUrl}/commit/${publicCommit}`), 'README: real 1.0.1 source commit link');
  requireText(readme, /^> At that historical snapshot, main and release-v1 were recorded at/m, 'README: historical source branches');
  for (const [version, commit] of [['1.0.0', initialCommit], ['1.0.1', publicCommit]]) {
    const row = publishing.split('\n').find(line => line.startsWith(`| ${version} |`));
    assert.ok(row?.includes(`| v${version} |`) && row.includes(`| [${commit}](${sourceUrl}/commit/${commit}) |`), `PUBLISHING: accurate ${version} history row`);
    assert.ok(linkTargets(bundle.docs['PUBLISHING.md']).includes(`${sourceUrl}/commit/${commit}`), `PUBLISHING: ${version} commit link`);
  }
  requireText(publishing, /\| 1\.0\.2 \| \[v1\.0\.2\]\(https:\/\/github\.com\/tech-progress\/logto-b2b-identity\/tree\/v1\.0\.2\), selected immutable target \| Resolve the actual commit from the tag; no push receipt asserted here \| Source-only selection; release-v1 prospective channel \|/,
    'PUBLISHING: no invented 1.0.2 source receipt');
  requireText(publishing, /main and release-v1 at the historical pre-live snapshot/, 'PUBLISHING: historical branch state');
  requireText(publishing, /current tree\/modes and reachable history for 1\.0\.1/, 'PUBLISHING: historical privacy-review scope');
  requireText(publishing, /repeat them for the actual 1\.0\.2 candidate/i, 'PUBLISHING: fresh candidate history review required');
  requireText(publishing, /Existing immutable tags are preserved/, 'PUBLISHING: immutable old tags');
  requireText(publishing, /## Source-only freeze and publication/, 'PUBLISHING: source-only publication sequence');
  requireText(publishing, /## Remote qualification and marketplace publication/, 'PUBLISHING: separate remote qualification sequence');
  requireText(publishing, /finite source-only grant\/default review acceptance/, 'PUBLISHING: finite frozen-export review');
  for (const file of ['README.md', 'PUBLISHING.md', 'SUPPORT.md']) {
    requireText(plain(bundle.docs[file]), /existing source-only permissions/, `${file}: existing source permissions`);
    requireText(plain(bundle.docs[file]), /no new binary distribution grant/, `${file}: no binary grant expansion`);
  }
  requireText(plain(bundle.docs['UPGRADE.md']), /m-admin/, 'UPGRADE: supported native break-glass client');
  requireText(plain(bundle.docs['UPGRADE.md']), /PATCH \/api\/users\/\{existingOwnerId\}\/password/, 'UPGRADE: native recovery API');
  for (const file of ['README.md', 'PUBLISHING.md', 'UPGRADE.md']) {
    requireText(plain(bundle.docs[file]), /all 79 public tables/i, `${file}: full local restore table boundary`);
    requireText(plain(bundle.docs[file]), /four native roles/i, `${file}: full local restore role boundary`);
    requireText(plain(bundle.docs[file]), /private[^.\n]*(?:certificate|certificates)/i, `${file}: private local certificate boundary`);
    requireText(plain(bundle.docs[file]), /(?:explicit[^.\n]*bounded|bounded[^.\n]*explicit)[^.\n]*opt-in/i, `${file}: bounded local certificate opt-in`);
  }
  for (const gate of qualificationGates) {
    assert.ok(publishing.split('\n').includes(`| ${gate} | Pending |`), `PUBLISHING: pending receipt row for ${gate}`);
  }
  for (const file of ['PUBLISHING.md', 'SUPPORT.md']) {
    const text = plain(bundle.docs[file]);
    for (const pattern of [/zero compute/, /standard scoped deletion/, /retained/i,
      /physical erasure/, /billing-zero result/]) requireText(text, pattern, `${file}: scoped cleanup and retention boundary`);
  }
  for (const file of ['README.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    const text = plain(bundle.docs[file]);
    requireText(text, /(?:two|different|distinct)[^.\n]*HTTPS origins|HTTPS origin[^.\n]*different/i, `${file}: distinct HTTPS origins`);
    requireText(text, /(?:permanent|independent)[^.\n]*(?:operator|gate)/i, `${file}: permanent independent gate`);
    requireText(text, /(?:native Logto privileges|gate alone never grants Logto privileges)/i, `${file}: gate is separate from Logto privileges`);
  }

  for (const variable of [...new Set(Object.values(bundle.defaults).flatMap(service => Object.keys(service))),
    'DB_URL', 'ALLOW_INSECURE_LOCALHOST', 'SOURCE_REPO', 'SOURCE_BRANCH', 'SOURCE_ROOT_DIR', 'DOCS_EXPECTED_VERSION']) {
    assert.ok(new RegExp(`\\b${variable}\\b`).test(readme), `README: document variable ${variable}`);
  }
  const readmeLinks = linkTargets(bundle.docs['README.md']);
  for (const file of ['PUBLISHING.md', 'SUPPORT.md', 'UPGRADE.md', 'LICENSE_REVIEW.md']) {
    assert.ok(readmeLinks.includes(file), `README: required shipped doc link ${file}`);
  }
  assert.deepEqual(bundle.volumes, { Postgres: { mountPath: '/var/lib/postgresql/data', sizeMB: 5000 } },
    'Postgres owns the sole 5000 MB volume');

  const metadata = bundle.metadata;
  assert.equal(metadata.directory, 'logto-b2b-identity');
  assert.equal(metadata.category, 'Authentication');
  assert.ok(metadata.description.length >= 45 && metadata.description.length <= 75, 'Metadata description: 45–75 characters');
  assert.equal(metadata.icon, 'https://raw.githubusercontent.com/logto-io/logto/v1.44.0/packages/console/src/favicon.ico',
    'Metadata icon belongs to the main Logto product');
  assert.ok(linkTargets(bundle.docs['MARKETPLACE.md']).includes(metadata.icon), 'MARKETPLACE: retain main-product icon link');
  assert.ok(!Object.hasOwn(metadata, 'id') && !Object.hasOwn(metadata, 'code'), 'No invented marketplace IDs/codes in source-only metadata');
  assert.deepEqual(metadata.origins, [
    { name: 'Logto', url: 'https://logto.io' },
    { name: 'PostgreSQL', url: 'https://www.postgresql.org' },
    { name: 'Node.js', url: 'https://nodejs.org' },
  ], 'Keep every main upstream metadata origin');
  for (const file of ['README.md', 'MARKETPLACE.md']) {
    const links = linkTargets(bundle.docs[file]);
    for (const { url } of metadata.origins) assert.ok(links.includes(url), `${file}: link metadata origin ${url}`);
  }
  assert.deepEqual(bundle.docs['MARKETPLACE.md'].split('\n').filter(line => /^#{1,6} /.test(line)), marketplaceHeadings,
    'Marketplace must retain the six shared headings');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = process.argv.slice(2);
  assert.ok(options.length <= 1 && options.every(option => /^--expected-version=1\.0\.[12]$/.test(option)),
    'Usage: node scripts/verify-docs.mjs [--expected-version=1.0.1|--expected-version=1.0.2]');
  const bundle = readDocBundle();
  const expectedVersion = options[0]?.split('=')[1] || bundle.version;
  verifyDocs(bundle, { expectedVersion });
  console.log(`PASS: local Recipe ${expectedVersion} docs; source-only freeze selection, historical source receipts, links, and marketplace contract. No push receipt or remote qualification asserted.`);
}
