import { readFileSync } from "node:fs";

const allowedActions = new Set(["promoted", "skipped", "error", "batch"]);

export function validateTransferSyncResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return "result must be a JSON object";
  if (typeof result.action !== "string" || !allowedActions.has(result.action)) return "action must be one of promoted, skipped, error, or batch";
  if (result.action === "error") return "sync reported action=error";
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("validate-transfer-sync-result.mjs")) {
  const filePath = process.argv[2];
  let result;
  try {
    if (!filePath) throw new Error("missing");
    result = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    console.error("Invalid transfer synchronization result: file is missing or does not contain valid JSON");
    process.exitCode = 1;
  }
  const error = validateTransferSyncResult(result);
  if (error) {
    console.error(`Invalid transfer synchronization result: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Transfer synchronization result is valid (${result.action}).`);
  }
}
