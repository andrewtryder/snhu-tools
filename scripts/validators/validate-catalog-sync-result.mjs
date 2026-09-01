import { readFileSync } from "node:fs";

export function validateCatalogSyncResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return "result must be a JSON object";
  if (result.action !== "promoted" && result.action !== "skipped") return "terminal action must be promoted or skipped";
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("validate-catalog-sync-result.mjs")) {
  let result;
  try {
    if (!process.argv[2]) throw new Error("missing");
    result = JSON.parse(readFileSync(process.argv[2], "utf8"));
  } catch {
    console.error("Invalid catalog synchronization result: file is missing or does not contain valid JSON");
    process.exitCode = 1;
  }
  const error = validateCatalogSyncResult(result);
  if (error) {
    console.error(`Invalid catalog synchronization result: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Catalog synchronization result is valid (${result.action}).`);
  }
}
