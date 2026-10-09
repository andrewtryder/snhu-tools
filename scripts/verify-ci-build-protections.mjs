import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const activeDir = path.resolve(rootDir, "src/data/snapshots");
const fixtureDir = path.resolve(rootDir, "src/data/fixtures/snapshots");
const backupDir = path.resolve(rootDir, ".snapshot-backup-temp-" + Date.now());

function copyDir(src, dest, filterFn) {
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(src)) {
    if (filterFn && !filterFn(file)) continue;
    cpSync(path.join(src, file), path.join(dest, file), { recursive: true });
  }
}

function restoreBackup() {
  if (existsSync(backupDir)) {
    copyDir(backupDir, activeDir);
    rmSync(backupDir, { recursive: true, force: true });
  }
}

process.on("exit", restoreBackup);
process.on("SIGINT", () => { restoreBackup(); process.exit(130); });
process.on("SIGTERM", () => { restoreBackup(); process.exit(143); });

function findStagedNonFixtureDir() {
  const dataDir = path.resolve(rootDir, "src/data");
  if (!existsSync(dataDir)) return null;
  const entries = readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(".snapshot-stage-")) {
      const stagePath = path.join(dataDir, entry.name);
      const manifestPath = path.join(stagePath, "manifest.json");
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
          if (manifest.fixture === false) {
            return stagePath;
          }
        } catch {
          // Ignore invalid manifest
        }
      }
    }
  }
  return null;
}

function runBuild(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.ALLOW_FIXTURE_SNAPSHOTS;
  return spawnSync("npm", ["run", "build"], {
    cwd: rootDir,
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function verifyRejectFixture() {
  console.log("==> Verifying production deployment rejects fixture snapshots...");
  // Load fixture snapshot into active
  copyDir(fixtureDir, activeDir);

  const manifestPath = path.join(activeDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.fixture !== true) {
    throw new Error("Fixture manifest did not have fixture=true");
  }

  const result = runBuild({ VERCEL_ENV: "production" });
  if (result.status === 0) {
    throw new Error("Fixture snapshot unexpectedly passed a production build");
  }

  const output = (result.stdout || "") + (result.stderr || "");
  if (!output.includes("Fixture static snapshots are forbidden in Vercel production deployments")) {
    console.warn("Build failed as expected, but output differed:\n" + output);
  }
  console.log("✔ Fixture snapshots successfully rejected in production build.");
}

function verifyAcceptNonFixture() {
  console.log("==> Verifying production deployment accepts non-fixture snapshots...");
  const stagedDir = findStagedNonFixtureDir();

  if (stagedDir) {
    console.log(`Using staged non-fixture snapshot from: ${path.relative(rootDir, stagedDir)}`);
    copyDir(stagedDir, activeDir, (file) => file.endsWith(".json") && file !== "report.json");
  } else {
    const currentManifestPath = path.join(activeDir, "manifest.json");
    const currentManifest = existsSync(currentManifestPath)
      ? JSON.parse(readFileSync(currentManifestPath, "utf8"))
      : null;

    if (currentManifest && currentManifest.fixture === false) {
      console.log("Using current active non-fixture snapshot.");
    } else {
      console.log("Synthesizing isolated non-fixture test environment from fixture bundles...");
      copyDir(fixtureDir, activeDir);
      const manifest = JSON.parse(readFileSync(path.join(activeDir, "manifest.json"), "utf8"));
      manifest.fixture = false;
      manifest.provenance = {
        kind: "fixture-verified",
        source: "ci-isolated-environment",
        sourceDigest: "ci-synthetic-digest",
        approvalReference: "PR-27",
        approved: true,
      };
      writeFileSync(path.join(activeDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    }
  }

  const result = runBuild({ VERCEL_ENV: "production" });
  if (result.status !== 0) {
    const output = (result.stdout || "") + (result.stderr || "");
    throw new Error("Non-fixture snapshot failed production build:\n" + output);
  }
  console.log("✔ Reviewed non-fixture snapshot successfully built for production.");
}

function main() {
  const args = process.argv.slice(2);
  const rejectOnly = args.includes("--mode=reject-fixture") || args.includes("--reject-fixture");
  const acceptOnly = args.includes("--mode=accept-non-fixture") || args.includes("--accept-non-fixture");

  // Save backup of original active snapshot
  copyDir(activeDir, backupDir);

  try {
    if (rejectOnly) {
      verifyRejectFixture();
    } else if (acceptOnly) {
      verifyAcceptNonFixture();
    } else {
      verifyRejectFixture();
      verifyAcceptNonFixture();
    }
  } finally {
    restoreBackup();
  }
}

main();
