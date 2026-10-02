import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { defineRailway, group, project, service, volume } from "railway/iac";

const repo = process.env.SOURCE_REPO;
const branch = process.env.SOURCE_BRANCH || "release-v1";
const rootDir = process.env.SOURCE_ROOT_DIR || "/logto-b2b-identity";
if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
  throw new Error("SOURCE_REPO must name your actual accessible owner/repository; no distribution repository is assumed");
}
if (!/^[A-Za-z0-9_.-]+$/.test(branch)) throw new Error("SOURCE_BRANCH must be a slash-free release branch or immutable tag");
if (!rootDir.startsWith("/") || rootDir.includes("..")) throw new Error("SOURCE_ROOT_DIR must be an absolute repository-root path without traversal");
const defaults = JSON.parse(readFileSync(new URL("../template-defaults.json", import.meta.url), "utf8"));
const source = { type: "github" as const, repo, branch, rootDirectory: rootDir };
const postgresImage = "public.ecr.aws/docker/library/postgres:17.11-bookworm@sha256:91eb910c44c7ed13f7f1a4ccadaa9ca72ef14cddc04cacb6e070e48eb44731a3";

export default defineRailway(() => {
  const databasePassword = randomBytes(32).toString("hex");
  const gatePassword = randomBytes(32).toString("hex");
  const data = volume("Postgres Data", { sizeMB: 5000 });
  const postgres = service("Postgres", {
    source: { image: postgresImage },
    volumeMounts: { "/var/lib/postgresql/data": data },
    env: { ...defaults.Postgres, POSTGRES_PASSWORD: { value: databasePassword, preserveExisting: true } },
    networking: {},
    replicas: 1,
  });
  const logto = service("Logto", {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "node /opt/railway-logto/backend.mjs",
    healthcheck: "/api/status",
    healthcheckTimeout: 300,
    replicas: 1,
    env: defaults.Logto,
    networking: {},
  });
  const gateways = ["Issuer", "Admin"].map(name => service(name, {
    source,
    build: { builder: "DOCKERFILE", dockerfilePath: "gateway.Dockerfile" },
    start: "node /app/gateway.mjs",
    healthcheck: "/healthz",
    healthcheckTimeout: 300,
    replicas: 1,
    env: name === "Admin" ? { ...defaults.Admin, ADMIN_GATE_PASSWORD: { value: gatePassword, preserveExisting: true } } : defaults.Issuer,
    networking: { serviceDomains: { "<hasDomain>": { port: 8080 } } },
  }));
  return project("Logto B2B identity", {
    resources: [group("Identity", [logto, ...gateways]), group("Storage", [postgres, data])],
  });
});
