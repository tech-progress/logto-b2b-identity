import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(new URL(path, `file://${root}`), 'utf8'));
const defaults = readJson('template-defaults.json');
const descriptions = readJson('template-descriptions.json');
const networking = readJson('template-networking.json');
const volumes = readJson('template-volumes.json');

export function renderGraph() {
  const rendered = JSON.parse(execFileSync(`${root}node_modules/.bin/railway-iac-ts`, [], { cwd: root, env: process.env, encoding: 'utf8' }));
  assert.equal(rendered.ok, true, 'Local IaC render must succeed');
  return rendered.graph;
}

export function contract(graph) {
  const services = graph.resources.filter(resource => resource.type === 'service');
  assert.ok(graph.resources.every(resource => ['service', 'volume', 'group'].includes(resource.type)), 'Unknown graph resource type');
  assert.deepEqual(services.map(service => service.name).sort(), Object.keys(defaults).sort(), 'Unexpected graph service set');
  const volumeResources = graph.resources.filter(resource => resource.type === 'volume');
  assert.equal(volumeResources.length, 1, 'Exactly one PostgreSQL volume required');
  assert.equal(volumeResources[0].config.sizeMB, 5000);
  const mounts = graph.edges.filter(edge => edge.type === 'mount');
  assert.equal(mounts.length, 1);
  assert.equal(mounts[0].from, 'service.Postgres');
  assert.equal(mounts[0].to, volumeResources[0].address);
  assert.equal(mounts[0].key, volumes.Postgres.mountPath);
  const generatedSecrets = [];
  const desired = Object.fromEntries(services.map(service => {
    const { type, ...source } = service.source;
    assert.equal(type, service.name === 'Postgres' ? 'image' : 'github');
    if (service.name !== 'Postgres') {
      assert.equal(source.repo, process.env.SOURCE_REPO, 'Repository dropped or changed');
      assert.equal(source.branch, process.env.SOURCE_BRANCH || 'release-v1', 'Release branch dropped or changed');
      assert.equal(source.rootDirectory, process.env.SOURCE_ROOT_DIR || '/logto-b2b-identity', 'Source root directory dropped or changed');
      assert.equal(source.image, undefined);
    } else {
      assert.equal(source.repo, undefined);
      assert.equal(source.image, 'public.ecr.aws/docker/library/postgres:17.11-bookworm@sha256:91eb910c44c7ed13f7f1a4ccadaa9ca72ef14cddc04cacb6e070e48eb44731a3');
    }
    assert.deepEqual(Object.keys(service.variables).sort(), Object.keys(defaults[service.name]).sort());
    for (const [key, value] of Object.entries(defaults[service.name])) {
      if ((service.name === 'Postgres' && key === 'POSTGRES_PASSWORD') || (service.name === 'Admin' && key === 'ADMIN_GATE_PASSWORD')) {
        const generated = service.variables[key].value;
        assert.equal(service.variables[key].type, 'raw', 'Native variable configuration required for generated secrets');
        assert.ok(typeof generated.value === 'string' && /^[a-f0-9]{64}$/.test(generated.value), `${service.name}.${key}: direct 256-bit cryptographic secret required`);
        assert.equal(generated.preserveExisting, true, `${service.name}.${key}: existing secret preservation required`);
        generatedSecrets.push(generated.value);
      } else {
        assert.equal(service.variables[key].value, value, `Graph variable drift: ${service.name}.${key}`);
      }
      assert.equal(typeof descriptions[service.name][key], 'string', `Missing description: ${service.name}.${key}`);
    }
    const publicPort = networking[service.name].publicPort;
    const desiredNetwork = publicPort ? { serviceDomains: { '<hasDomain>': { port: publicPort } } } : {};
    assert.deepEqual(service.networking ?? {}, desiredNetwork, `Graph networking drift: ${service.name}`);
    const variables = Object.fromEntries(Object.entries(defaults[service.name]).map(([key, value]) => [key, {
      defaultValue: value,
      description: descriptions[service.name][key],
      isOptional: false,
    }]));
    return [service.name, { source, build: service.build ?? {}, deploy: service.deploy ?? {}, variables, networking: desiredNetwork }];
  }));
  assert.equal(generatedSecrets.length, 2);
  assert.notEqual(generatedSecrets[0], generatedSecrets[1], 'Database and operator gate secrets must be distinct');
  return desired;
}

function serviceEntries(config) {
  const isList = Array.isArray(config.services);
  return Object.entries(config.services).map(([key, service]) => {
    const name = service.name ?? (!isList ? key : undefined);
    assert.ok(service && typeof service === 'object' && typeof name === 'string', 'Invalid service identity');
    if (!isList && Object.hasOwn(defaults, key)) assert.equal(name, key, 'Conflicting service identity');
    return { key, name, service };
  });
}

function declaredVolume(config, bindingKey) {
  if (!config.volumes) return undefined;
  assert.equal(Object.keys(config.volumes).length, 1, 'Unknown extra volume resource; refuse drift');
  const [key, volume] = Object.entries(config.volumes)[0];
  const identity = Array.isArray(config.volumes) ? volume.id : key;
  assert.equal(identity, bindingKey, 'Declared volume does not match existing Postgres binding');
  assert.ok(volume && typeof volume === 'object', 'Invalid declared volume');
  return volume;
}

function configIn(document) {
  const config = document.data?.template?.serializedConfig ?? document.serializedConfig ?? document;
  assert.ok(config.services && typeof config.services === 'object', 'Expected serializedConfig with services');
  const entries = serviceEntries(config);
  assert.deepEqual(entries.map(entry => entry.name).sort(), Object.keys(defaults).sort(), 'Unknown, missing, or duplicated draft service; refuse drift');
  assert.ok(!config.resources && Object.keys(config.buckets ?? {}).length === 0, 'Unverified extra resources/buckets are not supported');
  if (config.groups) {
    const groups = Object.entries(config.groups).map(([key, group]) => group.name ?? key).sort();
    assert.deepEqual(groups, ['Identity', 'Storage'], 'Unknown/missing group resource; refuse drift');
  }
  const postgres = entries.find(entry => entry.name === 'Postgres').service;
  const bindingKeys = Object.keys(postgres.volumeMounts ?? {});
  assert.equal(bindingKeys.length, 1, 'Postgres must already have exactly one real volume binding; refuse missing/multiple bindings');
  assert.notEqual(bindingKeys[0], volumes.Postgres.mountPath, 'A mount path is not an existing volume identity');
  assert.ok(postgres.volumeMounts[bindingKeys[0]] && typeof postgres.volumeMounts[bindingKeys[0]] === 'object', 'Invalid Postgres volume binding');
  declaredVolume(config, bindingKeys[0]);
  for (const { name, service } of entries) {
    if (name !== 'Postgres') assert.equal(Object.keys(service.volumeMounts ?? {}).length, 0, 'Unexpected non-Postgres volume resource; refuse drift');
  }
  return config;
}

export function restoreDraft(document, desired) {
  const output = structuredClone(document);
  const config = configIn(output);
  for (const { name, service } of serviceEntries(config)) {
    const expected = desired[name];
    for (const key of ['source', 'build', 'deploy', 'variables', 'networking']) service[key] = structuredClone(expected[key]);
    const volume = volumes[name];
    const bindingKey = volume && Object.keys(service.volumeMounts)[0];
    const previousMount = volume && service.volumeMounts[bindingKey];
    service.volumeMounts = volume ? { [bindingKey]: { ...previousMount, mountPath: volume.mountPath, sizeMB: volume.sizeMB } } : {};
    if (volume) {
      const declaration = declaredVolume(config, bindingKey);
      if (declaration) declaration.sizeMB = volume.sizeMB;
    }
  }
  return output;
}

export function auditDraft(document, desired) {
  const config = configIn(document);
  for (const { name, service } of serviceEntries(config)) {
    const expected = desired[name];
    for (const key of ['source', 'build', 'deploy', 'networking']) {
      assert.deepEqual(service[key] ?? {}, expected[key], `${name}.${key} drift`);
    }
    assert.deepEqual(Object.keys(service.variables ?? {}).sort(), Object.keys(expected.variables).sort(), `${name}: variable-name drift`);
    for (const [key, variable] of Object.entries(expected.variables)) {
      const actual = service.variables[key];
      assert.ok(actual.defaultValue === variable.defaultValue && actual.isOptional === false && actual.description === variable.description,
        `${name}.${key}: default, requirement, or description drift (values redacted)`);
      assert.ok(!actual.value && !actual.encryptedValue, `${name}.${key}: resolved secret/value must not replace template defaults`);
    }
    const volume = volumes[name];
    const bindings = Object.values(service.volumeMounts ?? {});
    assert.equal(bindings.length, volume ? 1 : 0, `${name}: binding count drift`);
    if (volume) {
      assert.equal(bindings[0].mountPath, volume.mountPath, 'Postgres mount path drift');
      assert.equal(bindings[0].sizeMB, volume.sizeMB, 'Postgres volume size drift');
      const declaration = declaredVolume(config, Object.keys(service.volumeMounts)[0]);
      if (declaration) assert.equal(declaration.sizeMB, volume.sizeMB, 'Declared volume size drift');
    }
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, inputPath, outputPath] = process.argv.slice(2);
    assert.ok(['restore', 'audit'].includes(mode) && inputPath && (mode !== 'restore' || outputPath), 'Usage: template-draft.mjs restore INPUT OUTPUT | audit INPUT');
    const desired = contract(renderGraph());
    const input = JSON.parse(readFileSync(inputPath, 'utf8'));
    const output = mode === 'restore' ? restoreDraft(input, desired) : input;
    auditDraft(output, desired);
    if (mode === 'restore') {
      assert.notEqual(inputPath, outputPath, 'Refuse overwriting the input snapshot');
      writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    console.log(`${mode}: local sources, variables, public origins, private backend, and PostgreSQL-only volume verified; no cloud calls`);
  } catch (error) {
    console.error(`Offline draft operation failed: ${error.message.split('\n')[0]}`);
    process.exit(1);
  }
}
