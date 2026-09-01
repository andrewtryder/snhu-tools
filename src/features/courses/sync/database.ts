import { withDirectClient } from "@/lib/db/client";
import { augmentQueryClient, type SqlClient } from "@/lib/db/sql";

export type CatalogDbClient = SqlClient;

/** Write jobs always use the authoritative POSTGRES_URL direct client. */
export async function withCatalogDbClient<T>(
  _options: { direct?: boolean },
  fn: (client: CatalogDbClient) => Promise<T>,
): Promise<T> {
  return withDirectClient((client) => fn(augmentQueryClient(client)));
}
