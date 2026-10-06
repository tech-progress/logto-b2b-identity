import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docFiles, readDocBundle, verifyDocs } from '../scripts/verify-docs.mjs';

const baseline = readDocBundle();
const expectedVersion = process.env.DOCS_EXPECTED_VERSION || baseline.version;
const verify = bundle => verifyDocs(bundle, { expectedVersion });
function rejectsMutation(mutate, reason) {
  const altered = structuredClone(baseline);
  mutate(altered);
  assert.throws(() => verify(altered), reason);
}

test('source-freeze docs preserve historical receipts, required links, versions and marketplace structure', () => {
  assert.equal(verify(baseline), true);
});

test('source-freeze selection requires the dated 1.0.2 VERSION and CHANGELOG', () => {
  assert.equal(verifyDocs(baseline, { expectedVersion: '1.0.2' }), true);
  assert.throws(() => verifyDocs(baseline, { expectedVersion: '1.0.1' }), /VERSION/);
  rejectsMutation(bundle => bundle.changelog = bundle.changelog.replace('## [1.0.2] - ', '## [1.0.3] - '), /CHANGELOG/);
  rejectsMutation(bundle => bundle.changelog = bundle.changelog.replace('2026-10-06', 'Unreleased'), /dated source-freeze/);
  assert.throws(() => verifyDocs(baseline, { expectedVersion: '9.0.0' }), /Expected local version/);
  const stale = structuredClone(baseline);
  stale.version = '1.0.1';
  assert.throws(() => verifyDocs(stale, { expectedVersion: '1.0.1' }), /Source-freeze phase/);
});

test('frozen source-selection status needs no circular commit or push receipt before or after publication', () => {
  for (const moment of ['before source publication', 'after source publication']) {
    const frozen = structuredClone(baseline);
    frozen.docs['PUBLISHING.md'] += `\nSelection is unchanged ${moment}; all remote receipts remain PENDING.\n`;
    assert.equal(verify(frozen), true);
  }
  for (const file of docFiles) {
    rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replace(
      'selected for immutable source-only publication', 'staged, not released'), /selected 1.0.2/);
    rejectsMutation(bundle => bundle.docs[file] += '\nRecipe 1.0.2 is staged, not released.\n', /obsolete stage-only/);
    rejectsMutation(bundle => bundle.docs[file] += '\nThe current public source release is Recipe 1.0.1.\n', /stale source\/version/);
    rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll('/tree/v1.0.2', '/tree/v1.0.1'), /immutable tag navigation/);
  }
});

test('missing or stale versions and source history fail', () => {
  rejectsMutation(bundle => bundle.version = '1.0.0', /VERSION/);
  rejectsMutation(bundle => bundle.changelog = '', /CHANGELOG/);
  rejectsMutation(bundle => bundle.docs['UPGRADE.md'] += '\nTemplate version `1.0.0` is current.\n', /stale source\/version/);
  rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replaceAll(
    '9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554', '0000000000000000000000000000000000000000'), /accurate 1.0.1 history|invented source commit/);
  rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replaceAll(
    '19ccd4cae07c820917b4c028a649cb87972c4516', '0000000000000000000000000000000000000000'), /accurate 1.0.0 history|invented source commit/);
  rejectsMutation(bundle => bundle.docs['README.md'] = bundle.docs['README.md'].replaceAll(
    '9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554', '0000000000000000000000000000000000000000'), /real 1.0.1 source|invented source commit/);
  rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replace(
    '| `v1.0.1` |', '| `v1.0.0` |'), /accurate 1.0.1 history/);
  rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replace(
    'no push receipt asserted here', 'Published at the 1.0.1 commit'), /invented 1.0.2/);
  rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replace(
    'Existing immutable tags are preserved', 'Repoint existing tags'), /immutable old tags/);
  rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replace(
    'current tree/modes and reachable history for 1.0.1', 'only current filenames'), /privacy-review scope/);
});

test('every shipped doc distinguishes the source-freeze phase from the historical snapshot and retains pins', () => {
  for (const file of docFiles) {
    rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replace('Source-only freeze candidate', 'Qualified release'), /source-freeze phase/);
    rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replace('Historical pre-live snapshot', 'Current release snapshot'), /explicitly historical/);
    for (const version of ['1.44.0', '17.11', '22.23.3']) {
      rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll(version, '99.0.0'), /pinned upstream/);
    }
  }
});

test('remote pending identity gates and finite review boundaries cannot disappear', () => {
  for (const file of docFiles) {
    for (const [pattern, reason] of [
      [/passed/gi, /ten local acceptance passes/], [/owner/gi, /owner gate/], [/PKCE/g, /PKCE gate/],
      [/allow\/deny/g, /allow\/deny gate/], [/recovery/gi, /recovery gate/],
      [/fresh/gi, /fresh restore gate/], [/pending/gi, /remote status pending/],
      [/receipts/gi, /remote status pending/], [/source-only recipe review/gi, /finite source review/],
      [/artifact review|artifact-review worker/gi, /separate artifact review/],
      [/assembled-image distribution clearance/gi, /artifact clearance boundary/],
      [/full licensing\/security clearance/gi, /clearance boundary/],
      [/universal certification/gi, /certification boundary/],
    ]) rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replace(pattern, 'removed'), reason);
  }
});

test('cleanup retains scoped zero-compute and honest retention language', () => {
  for (const file of ['PUBLISHING.md', 'SUPPORT.md']) {
    for (const phrase of ['zero compute', 'standard scoped deletion', 'physical erasure', 'billing-zero result']) {
      rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll(phrase, 'removed'), /cleanup and retention/);
    }
  }
});

test('pending receipt rows cannot be replaced by claims of passing gates or publication', () => {
  const gateRows = baseline.docs['PUBLISHING.md'].split('\n').filter(line => line.endsWith('| Pending |'));
  assert.equal(gateRows.length, 6);
  for (const row of gateRows) {
    rejectsMutation(bundle => bundle.docs['PUBLISHING.md'] = bundle.docs['PUBLISHING.md'].replace(row, row.replace('Pending', 'Passed')), /pending receipt row/);
  }
  for (const file of docFiles) {
    for (const claim of ['Recipe 1.0.2 source is published.', 'Recipe 1.0.2 is released.',
      'Live qualification is complete.', 'All B2B gates have passed.',
      'Remote gates: PASS.', 'All remote gates: PASS.', 'Remote HTTPS qualification is passed.', 'Railway qualification is complete.',
      'Marketplace publication is published.', 'Railway marketplace release is published.', 'Source push: PASS.', 'Push receipt: abc123.',
      'This recipe has full licensing/security clearance.', 'This recipe has assembled-image distribution clearance.', 'The review provides universal certification.', 'This recipe grants new binary distribution rights.']) {
      rejectsMutation(bundle => bundle.docs[file] += `\n${claim}\n`, /contradictory/);
    }
  }
});

test('private, unknown, unsafe and missing doc links fail even for existing private files', () => {
  for (const target of ['FINDINGS.md', '../FINDINGS.md', 'artifacts/worker4-public-source-next.json',
    '/tmp/localops.log', 'unknown-private-notes.md', 'scripts/secret-operations.sh',
    'https://private.example.com/evidence', 'http://localhost:18421/console',
    'file:///home/operator/notes', 'https://github.com/tech-progress/logto-b2b-identity/FINDINGS.md',
    'https://operator:password@github.com/tech-progress/logto-b2b-identity',
    'https://github.com/tech-progress/logto-b2b-identity?token=secret',
    'https://github.com/tech-progress/logto-b2b-identity/%46INDINGS.md',
    'https://github.com/tech-progress/logto-b2b-identity/%2everification/notes',
    'https://railway.com/deploy/invented-code']) {
    rejectsMutation(bundle => {
      bundle.docs['README.md'] += `\n[Private evidence](${target})\n`;
      bundle.linkedFiles[target] = 'Existing file does not make the link safe.';
    });
  }
  rejectsMutation(bundle => delete bundle.linkedFiles['SUPPORT.md'], /missing local link target/);
  rejectsMutation(bundle => bundle.docs['README.md'] = bundle.docs['README.md'].replace('[SUPPORT.md](SUPPORT.md)', 'Support'), /required shipped doc link/);
  rejectsMutation(bundle => bundle.docs['README.md'] += '\n[notes]: unknown-private-notes.md\n', /unshipped local doc link/);
  rejectsMutation(bundle => bundle.docs['README.md'] += '\n[notes](unknown-private-notes.md "Internal notes")\n', /unshipped local doc link/);
  rejectsMutation(bundle => bundle.docs['README.md'] += '\n<file:///private-notes.md>\n', /public links use HTTPS/);
  rejectsMutation(bundle => bundle.docs['README.md'] += '\n<a href="unknown-private-notes.md">Notes</a>\n', /unshipped local doc link/);
});

test('marketplace headings, product icon, all origins and description remain required', () => {
  const headings = baseline.docs['MARKETPLACE.md'].split('\n').filter(line => /^#{1,6} /.test(line));
  assert.equal(headings.length, 6);
  for (const heading of headings) {
    rejectsMutation(bundle => bundle.docs['MARKETPLACE.md'] = bundle.docs['MARKETPLACE.md'].replace(heading, 'Removed heading'), /six shared headings/);
  }
  for (const { url } of baseline.metadata.origins) {
    for (const file of ['README.md', 'MARKETPLACE.md']) {
      rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll(`](${url})`, '](https://docs.logto.io)'), /metadata origin/);
    }
  }
  rejectsMutation(bundle => bundle.metadata.icon = 'https://www.postgresql.org/logo.png', /main Logto product/);
  rejectsMutation(bundle => bundle.docs['MARKETPLACE.md'] = bundle.docs['MARKETPLACE.md'].replace(baseline.metadata.icon, 'https://www.postgresql.org/logo.png'), /main-product icon link/);
  rejectsMutation(bundle => bundle.metadata.origins.pop(), /every main upstream/);
  rejectsMutation(bundle => bundle.metadata.description = 'Logto', /45–75 characters/);
  rejectsMutation(bundle => bundle.metadata.description = 'x'.repeat(76), /45–75 characters/);
  rejectsMutation(bundle => bundle.metadata.id = 'invented', /invented marketplace/);
  rejectsMutation(bundle => bundle.metadata.code = 'invented', /invented marketplace/);
});

test('variable documentation and the sole 5000 MB PostgreSQL volume remain required', () => {
  rejectsMutation(bundle => bundle.defaults.Admin.UNDOCUMENTED_SECRET = 'generated', /document variable UNDOCUMENTED_SECRET/);
  rejectsMutation(bundle => bundle.docs['README.md'] = bundle.docs['README.md'].replaceAll('DB_URL', 'REMOVED_DSN'), /document variable DB_URL/);
  rejectsMutation(bundle => bundle.volumes.Postgres.sizeMB = 1000, /sole 5000 MB volume/);
  rejectsMutation(bundle => bundle.volumes.Admin = { mountPath: '/shared', sizeMB: 5000 }, /sole 5000 MB volume/);
});

test('local acceptance, restore, recovery and existing grant boundaries cannot be expanded or erased', () => {
  for (const file of ['README.md', 'PUBLISHING.md', 'UPGRADE.md']) {
    for (const [pattern, reason] of [
      [/all 79 public tables/gi, /restore table boundary/],
      [/four native roles/gi, /restore role boundary/],
      [/private[^.\n]*certificates?/gi, /private local certificate boundary/],
      [/opt-in/gi, /bounded local certificate opt-in/],
    ]) rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replace(pattern, 'removed'), reason);
  }
  rejectsMutation(bundle => bundle.docs['UPGRADE.md'] = bundle.docs['UPGRADE.md'].replaceAll('m-admin', 'invented-client'), /native break-glass/);
  rejectsMutation(bundle => bundle.docs['UPGRADE.md'] = bundle.docs['UPGRADE.md'].replace('PATCH /api/users/{existingOwnerId}/password', 'SQL password rewrite'), /native recovery API/);
  for (const file of ['README.md', 'PUBLISHING.md', 'SUPPORT.md']) {
    rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll('existing source-only permissions', 'expanded image permissions'), /existing source permissions/);
    rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll('no new binary distribution grant', 'new binary distribution grant'), /binary grant expansion/);
  }
  for (const file of docFiles) {
    for (const obligation of ['AGPL', 'ELv2', 'Artistic', 'SAML', 'Koa']) {
      rejectsMutation(bundle => bundle.docs[file] = bundle.docs[file].replaceAll(obligation, 'removed'));
    }
    for (const leak of ['.verification/notes.json', 'native-acceptance-summary.json', 'localImageSHA: sha256:private', 'testID=private-case']) {
      rejectsMutation(bundle => bundle.docs[file] += `\n${leak}\n`, /private operational/);
    }
  }
});

test('bare links and changelog cannot introduce private links or false release receipts', () => {
  for (const target of ['https://private.example.com/evidence', 'http://localhost:18421/console',
    'https://operator:password@github.com/tech-progress/logto-b2b-identity',
    'https://github.com/tech-progress/logto-b2b-identity?token=secret']) {
    rejectsMutation(bundle => bundle.docs['README.md'] += `\nSee ${target}\n`);
    rejectsMutation(bundle => bundle.changelog += `\n[Evidence](${target})\n`);
  }
  rejectsMutation(bundle => bundle.docs['README.md'] += '\n[Source commit](https://github.com/tech-progress/logto-b2b-identity/commit/0000000000000000000000000000000000000000)\n', /invented source commit/);
  rejectsMutation(bundle => bundle.changelog += '\n- Remote gates: PASS.\n', /contradictory/);
  rejectsMutation(bundle => bundle.changelog += '\nRecipe 1.0.2 source is published.\n', /contradictory/);
  rejectsMutation(bundle => bundle.changelog += '\n[Private](.verification/notes.md)\n', /private operational/);
});
