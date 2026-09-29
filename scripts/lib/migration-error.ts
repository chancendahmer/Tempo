const guidance: Record<string, string> = {
  ECONNREFUSED: "PostgreSQL refused the connection. Check that the Railway database service is running and DATABASE_URL references that service.",
  ECONNRESET: "The database connection was reset. Check PostgreSQL service health and restart logs.",
  ENOTFOUND: "The database hostname could not be resolved. Check the DATABASE_URL reference and that the services share the Railway project environment.",
  EAI_AGAIN: "Database DNS lookup temporarily failed. Check the database service and private network before retrying.",
  ETIMEDOUT: "The database connection timed out. Check PostgreSQL service health, network access and the DATABASE_URL reference.",
  "28P01": "PostgreSQL rejected the password. Refresh DATABASE_URL from the existing database service; do not paste its value into logs or chat.",
  "28000": "PostgreSQL rejected authentication. Check the database role and connection configuration.",
  "3D000": "The configured database does not exist. Verify the database service and database name in the connection configuration.",
  "42501": "The database role lacks permission for this migration. Check its database/schema privileges; do not grant broad privileges blindly.",
  "57P03": "PostgreSQL is not ready to accept connections. Wait for database recovery/startup to complete before redeploying the web service.",
  "53300": "PostgreSQL has too many connections. Check connection limits and active web/worker deployments.",
  "53100": "PostgreSQL reports insufficient disk space. Check the database volume capacity.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "Database TLS certificate validation failed. Check the database TLS configuration; do not disable certificate verification as a workaround.",
};

/** Never print provider messages, SQL, parameters, URLs or error objects. */
export function migrationFailureSummary(error: unknown): string {
  const codes = new Set<string>();
  const visited = new Set<object>();
  let timeout = false;
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 8 || visited.has(value)) return;
    visited.add(value);
    const item = value as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    if (typeof item.code === "string" && Object.hasOwn(guidance, item.code)) codes.add(item.code);
    // node-postgres also reports connection timeout without a code.
    if (typeof item.message === "string" && /connection timeout|timeout exceeded when trying to connect|connection terminated due to connection timeout/i.test(item.message)) timeout = true;
    visit(item.cause, depth + 1);
    if (Array.isArray(item.errors)) item.errors.slice(0, 20).forEach(nested => visit(nested, depth + 1));
  }
  visit(error, 0);
  if (!codes.size && timeout) codes.add("ETIMEDOUT");
  return ["Tempo database migration failed.", ...Array.from(codes, code => `[${code}] ${guidance[code]}`),
    ...(codes.size ? [] : ["No recognized database error code was available. Check the PostgreSQL service logs and deployment configuration."]),
    "Raw error details are omitted to protect credentials and query data."].join("\n");
}
