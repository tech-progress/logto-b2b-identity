import assert from 'node:assert/strict';
import { test } from 'node:test';
import { graphToEnvironmentConfig } from 'railway/iac';
import { auditDraft, contract, renderGraph, restoreDraft } from '../scripts/template-draft.mjs';

test('direct authoring secrets are independent 256-bit values with preservation intent', { skip: !process.env.SOURCE_REPO }, () => {
  const secrets = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    const graph = renderGraph();
    contract(graph);
    for (const resource of graph.resources.filter(resource => resource.type === 'service')) {
      for (const key of ['POSTGRES_PASSWORD', 'ADMIN_GATE_PASSWORD']) {
        const variable = resource.variables?.[key]?.value;
        if (!variable) continue;
        assert.ok(typeof variable.value === 'string' && /^[a-f0-9]{64}$/.test(variable.value));
        assert.equal(variable.preserveExisting, true);
        secrets.push(variable.value);
      }
    }
  }
  assert.equal(secrets.length, 6);
  assert.equal(new Set(secrets).size, 6);
});

test('render and offline draft contract reject source, variable, volume and networking drift', { skip: !process.env.SOURCE_REPO }, () => {
  const desired = contract(renderGraph());
  const volumeId = 'a127cc33-fc3b-4973-a415-78c6e72c21ef';
  const snapshot = { services: Object.keys(desired).map(name => ({ name, volumeMounts: name === 'Postgres' ? { [volumeId]: { mountPath: '/old-path', sizeMB: 1000, backupSchedules: ['0 2 * * *'] } } : {} })) };
  const restored = restoreDraft(snapshot, desired);
  assert.equal(auditDraft(restored, desired), true);
  const postgres = restored.services.find(service => service.name === 'Postgres');
  assert.deepEqual(Object.keys(postgres.volumeMounts), [volumeId]);
  assert.equal(postgres.volumeMounts[volumeId].mountPath, '/var/lib/postgresql/data');
  assert.deepEqual(postgres.volumeMounts[volumeId].backupSchedules, ['0 2 * * *']);
  assert.equal(restored.services.find(service => service.name === 'Logto').source.rootDirectory, process.env.SOURCE_ROOT_DIR || '/logto-b2b-identity');
  const mutate = callback => {
    const altered = structuredClone(restored);
    callback(altered.services);
    assert.throws(() => auditDraft(altered, desired));
  };
  mutate(services => services.push({ name: 'Unknown' }));
  mutate(services => services.find(service => service.name === 'Logto').source.rootDirectory = '/wrong');
  mutate(services => services.find(service => service.name === 'Logto').source.image = 'unused-seed-image');
  mutate(services => services.find(service => service.name === 'Admin').variables.ADMIN_GATE_PASSWORD.defaultValue = 'resolved-value');
  mutate(services => services.find(service => service.name === 'Logto').networking = { serviceDomains: { '<hasDomain>': { port: 3002 } } });
  mutate(services => services.find(service => service.name === 'Issuer').networking.serviceDomains['<hasDomain>'].port = 3002);
  mutate(services => services.find(service => service.name === 'Admin').variables.GATEWAY_ROLE.defaultValue = 'issuer');
  mutate(services => services.find(service => service.name === 'Admin').volumeMounts = { '/shared': { sizeMB: 5000 } });
  mutate(services => services.find(service => service.name === 'Postgres').volumeMounts[volumeId].sizeMB = 1000);
  mutate(services => services.find(service => service.name === 'Postgres').volumeMounts[volumeId].mountPath = '/wrong');
  mutate(services => services.find(service => service.name === 'Postgres').volumeMounts = {});
  mutate(services => services.find(service => service.name === 'Postgres').volumeMounts.extra = { mountPath: '/shared', sizeMB: 1000 });
  const missingBinding = structuredClone(snapshot);
  missingBinding.services.find(service => service.name === 'Postgres').volumeMounts = {};
  assert.throws(() => restoreDraft(missingBinding, desired));
  const mapped = { services: Object.fromEntries(snapshot.services.map((service, index) => [`existing-service-${index}`, service])) };
  const restoredMap = restoreDraft(mapped, desired);
  assert.deepEqual(Object.keys(restoredMap.services), Object.keys(mapped.services));
  assert.equal(auditDraft(restoredMap, desired), true);
  assert.throws(() => restoreDraft({ ...snapshot, resources: [{ name: 'Unexpected' }] }, desired));
  const extraBinding = structuredClone(snapshot);
  extraBinding.services.find(service => service.name === 'Admin').volumeMounts = { anotherVolume: { mountPath: '/shared' } };
  assert.throws(() => restoreDraft(extraBinding, desired));
  const declared = { ...snapshot, volumes: { [volumeId]: { sizeMB: 1000 } } };
  const restoredDeclaration = restoreDraft(declared, desired);
  assert.deepEqual(Object.keys(restoredDeclaration.volumes), [volumeId]);
  assert.equal(restoredDeclaration.volumes[volumeId].sizeMB, 5000);
  assert.equal(auditDraft(restoredDeclaration, desired), true);
  assert.throws(() => restoreDraft({ ...declared, volumes: { ...declared.volumes, extraVolume: { sizeMB: 5000 } } }, desired));
  const sdkSnapshot = graphToEnvironmentConfig(renderGraph());
  const sdkRestored = restoreDraft(sdkSnapshot, desired);
  assert.equal(auditDraft(sdkRestored, desired), true);
  assert.deepEqual(Object.keys(sdkRestored.services), Object.keys(sdkSnapshot.services));
  assert.deepEqual(Object.keys(sdkRestored.services.Postgres.volumeMounts), ['Postgres Data']);
  assert.throws(() => restoreDraft({ services: [{ name: 'Unknown' }] }, desired));
});
