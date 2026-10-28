// Small adapter keeps the tested practice API portable between D1 and PostgreSQL.
export interface SqlClient {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null; affectedRows?: number }>;
}
export function postgresDatabase(client: SqlClient) {
  return {
    prepare(source: string) {
      let index = 0;
      let sql = source.replace(/\?/g, () => `$${++index}`);
      if (sql.startsWith('INSERT OR IGNORE INTO learner')) {
        sql = sql.replace('INSERT OR IGNORE', 'INSERT') + ' ON CONFLICT(id) DO NOTHING';
      }
      // PostgreSQL requires target columns qualified inside an upsert.
      if (sql.startsWith('INSERT INTO throttle')) {
        sql = sql.replace(/WHEN until_ms/g, 'WHEN throttle.until_ms')
          .replace('ELSE count+1', 'ELSE throttle.count+1')
          .replace('ELSE until_ms END', 'ELSE throttle.until_ms END');
      }
      let values: any[] = [];
      const statement = {
        bind(...args: any[]) { values = args; return statement; },
        async first<T>() { return (await client.query(sql, values)).rows[0] as T || null; },
        async run() {
          const result = await client.query(sql, values);
          return { meta: { changes: result.rowCount ?? result.affectedRows ?? 0 } };
        },
      };
      return statement;
    },
  };
}
export const schema = `
CREATE TABLE IF NOT EXISTS learner (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access (id INTEGER PRIMARY KEY CHECK(id=1), invite_hash TEXT NOT NULL, pin_hash TEXT NOT NULL, generation INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires BIGINT NOT NULL, generation INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_ms BIGINT NOT NULL);
`;
