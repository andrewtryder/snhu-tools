import { readFileSync } from "node:fs";

const allowedActions = new Set(["promoted", "skipped"]);
const requiredFields = ["action", "status", "importedCount", "skippedCount", "failedCount"];

/** Validates the final Program writer CLI result, not intermediate sync actions. */
export function validateProgramSyncResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return "result must be a JSON object";
  for (const field of requiredFields) {
    if (!(field in result)) return `missing required property '${field}'`;
  }
  if (typeof result.action !== "string" || !allowedActions.has(result.action)) {
    return "terminal action must be promoted or skipped";
  }
  if (typeof result.status !== "string" || result.status.trim() === "") return "status must be a non-empty string";
  for (const field of ["importedCount", "skippedCount", "failedCount"]) {
    if (!Number.isInteger(result[field]) || result[field] < 0) return `${field} must be a non-negative integer`;
  }
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("validate-sync-result.mjs")) {
  let result;
  try {
    if (!process.argv[2]) throw new Error("missing");
    result = JSON.parse(readFileSync(process.argv[2], "utf8"));
  } catch {
    console.error("Invalid synchronization result: file is missing or does not contain valid JSON");
    process.exitCode = 1;
  }
  const error = validateProgramSyncResult(result);
  if (error) {
    console.error(`Invalid synchronization result: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Synchronization result is valid (${result.action}).`);
  }
}
