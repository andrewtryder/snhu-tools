import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const activeDir = path.resolve(rootDir, "src/data/snapshots");
const fixtureDir = path.resolve(rootDir, "src/data/fixtures/snapshots");

function copyDir(src, dest, filterFn) {
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(src)) {
    if (filterFn && !filterFn(file)) continue;
    cpSync(path.join(src, file), path.join(dest, file), { recursive: true });
  }
}

function assertValidReviewedSnapshot(dir) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Non-fixture validation failed: manifest missing in ${dir}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported schema version ${manifest.schemaVersion}`);
  }
  if (manifest.fixture !== false) {
    throw new Error("Snapshot manifest must have fixture === false for non-fixture production builds");
  }
  const prov = manifest.provenance;
  if (!prov || prov.kind === "fixture" || !prov.approved || !prov.approvalReference || !/^[a-f0-9]{64}$/i.test(prov.sourceDigest)) {
    throw new Error(`Invalid non-fixture provenance in ${dir}: ${JSON.stringify(prov)}`);
  }
  const requiredDomains = ["programs", "courses", "transfers", "search"];
  for (const domain of requiredDomains) {
    const domainEntry = manifest.domains?.[domain];
    if (!domainEntry || !domainEntry.required || !domainEntry.sha256) {
      throw new Error(`Manifest missing required domain entry for ${domain}`);
    }
    const filePath = path.join(dir, domainEntry.file || `${domain}.json`);
    if (!existsSync(filePath)) {
      throw new Error(`Domain file missing: ${filePath}`);
    }
    const content = readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    if (hash !== domainEntry.sha256) {
      throw new Error(`Checksum mismatch for ${domain}: expected ${domainEntry.sha256}, got ${hash}`);
    }
    if (!data.meta || data.meta.domain !== domain) {
      throw new Error(`Malformed metadata in ${domain}`);
    }
    for (const [key, expectedCount] of Object.entries(domainEntry.counts || {})) {
      if (typeof expectedCount !== "number" || expectedCount <= 0) {
        throw new Error(`Incomplete ${key} count in manifest for ${domain}: ${expectedCount}`);
      }
      if (data.meta.counts?.[key] !== expectedCount) {
        throw new Error(`Count mismatch in ${domain} for ${key}: expected ${expectedCount}, got ${data.meta.counts?.[key]}`);
      }
    }
  }

  const reportPath = path.join(dir, "report.json");
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const rec = report.reconciliation;
    if (rec?.courses?.records?.rejectedRows !== 0 || rec?.courses?.prerequisiteEdges?.rejectedRows !== 0) {
      throw new Error("Report reconciliation contains non-zero rejected rows");
    }
  }
  return true;
}

function findStagedNonFixtureDir() {
  const dataDir = path.resolve(rootDir, "src/data");
  if (!existsSync(dataDir)) return null;
  const entries = readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(".snapshot-stage-")) {
      const stagePath = path.join(dataDir, entry.name);
      try {
        if (assertValidReviewedSnapshot(stagePath)) {
          return stagePath;
        }
      } catch {
        // Continue looking for valid stage
      }
    }
  }
  return null;
}

function withTemporarySnapshot(snapshotSourceDir, fn) {
  const tempActiveBackup = path.resolve(rootDir, `src/data/.snapshots.active-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  let backupCreated = false;

  const restore = () => {
    if (backupCreated && existsSync(tempActiveBackup)) {
      if (existsSync(activeDir)) {
        rmSync(activeDir, { recursive: true, force: true });
      }
      renameSync(tempActiveBackup, activeDir);
      backupCreated = false;
    }
  };

  const onExit = () => restore();
  const onSignal = () => {
    restore();
    process.exit(1);
  };

  process.on("exit", onExit);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    if (existsSync(activeDir)) {
      renameSync(activeDir, tempActiveBackup);
      backupCreated = true;
    }
    mkdirSync(activeDir, { recursive: true });
    copyDir(snapshotSourceDir, activeDir);
    return fn();
  } finally {
    process.removeListener("exit", onExit);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    restore();
  }
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

  withTemporarySnapshot(fixtureDir, () => {
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
    const expectedError = "Fixture static snapshots are forbidden in Vercel production deployments";
    if (!output.includes(expectedError)) {
      throw new Error(`Build failed but did not produce the expected guard error ("${expectedError}"). Output:\n${output}`);
    }
    console.log("✔ Fixture snapshots successfully rejected in production build.");
  });
}

function verifyAcceptNonFixture() {
  console.log("==> Verifying production deployment accepts non-fixture snapshots...");
  const stagedDir = findStagedNonFixtureDir();

  let targetDir = null;
  if (stagedDir) {
    targetDir = stagedDir;
    console.log(`Using staged non-fixture snapshot from: ${path.relative(rootDir, stagedDir)}`);
  } else {
    try {
      assertValidReviewedSnapshot(activeDir);
      targetDir = activeDir;
      console.log("Using current active non-fixture snapshot.");
    } catch (err) {
      throw new Error(
        "No genuinely reviewed non-fixture snapshot found with valid provenance, verified checksums, and complete domain counts. Refusing to synthesize fixture data.\n" +
        err.message
      );
    }
  }

  if (targetDir === activeDir) {
    const result = runBuild({ VERCEL_ENV: "production" });
    if (result.status !== 0) {
      const output = (result.stdout || "") + (result.stderr || "");
      throw new Error("Non-fixture snapshot failed production build:\n" + output);
    }
  } else {
    withTemporarySnapshot(targetDir, () => {
      const result = runBuild({ VERCEL_ENV: "production" });
      if (result.status !== 0) {
        const output = (result.stdout || "") + (result.stderr || "");
        throw new Error("Staged non-fixture snapshot failed production build:\n" + output);
      }
    });
  }

  console.log("✔ Reviewed non-fixture snapshot successfully built for production.");
}

function main() {
  const args = process.argv.slice(2);
  const rejectOnly = args.includes("--mode=reject-fixture") || args.includes("--reject-fixture");
  const acceptOnly = args.includes("--mode=accept-non-fixture") || args.includes("--accept-non-fixture");

  if (rejectOnly) {
    verifyRejectFixture();
  } else if (acceptOnly) {
    verifyAcceptNonFixture();
  } else {
    verifyRejectFixture();
    verifyAcceptNonFixture();
  }
}

main();
