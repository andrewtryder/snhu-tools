import type { QueryResult, QueryResultRow } from "pg";

export type SqlQueryable = {
  query: <R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ) => Promise<QueryResult<R>>;
};

export type SqlClient = SqlQueryable & {
  sql: <R extends QueryResultRow = QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<QueryResult<R>>;
};

export function augmentQueryClient<T extends SqlQueryable>(client: T): T & SqlClient {
  const augmented = client as T & SqlClient;
  augmented.sql = (strings, ...values) => {
    let text = "";
    strings.forEach((part, index) => {
      text += part;
      if (index < values.length) text += `$${index + 1}`;
    });
    return client.query(text, values);
  };
  return augmented;
}
