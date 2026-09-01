import { readFileSync } from "node:fs";

const allowedActions = new Set(["promoted", "skipped"]);

export function validateTransferSyncResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return "result must be a JSON object";
  if (typeof result.action !== "string" || !allowedActions.has(result.action)) return "terminal action must be promoted or skipped";
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
