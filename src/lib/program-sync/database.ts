import dotenv from "dotenv";
import { withDirectClient } from "@/lib/db/client";

dotenv.config();

export const withSyncClient = withDirectClient;
export const withProgramSyncConnection = withDirectClient;

export async function recordProgramSyncError(syncId: string, errorMsg: string): Promise<void> {
  try {
    await withDirectClient(async (client) => {
      await client.query(
        "UPDATE program_sync_state SET status = 'error', last_error = $1 WHERE id = 'program_sync' AND sync_id = $2;",
        [errorMsg, syncId]
      );
    });
  } catch {
    // ignore secondary error
  }
}
