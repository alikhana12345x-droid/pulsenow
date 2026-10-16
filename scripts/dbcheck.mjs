// Connectivity diagnostic — run this ON THE SERVER, from the app root.
//
//   DB_URL='postgresql://...' node dbcheck.mjs
//
// Answers, in order: does the hostname resolve, is the port reachable, and
// does Postgres actually accept us. Shared hosting commonly blocks outbound
// database ports, which looks identical to a bad password from the app's side
// — this separates the two. Both Supabase pooler ports are probed so you can
// see whether one is open and the other blocked.
import { lookup } from "node:dns/promises";
import { connect } from "node:net";

const url = process.env.DB_URL || process.argv[2];
if (!url) {
  console.error("Usage: DB_URL='postgresql://...' node dbcheck.mjs");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error("DB_URL is not a valid URL. Check for stray quotes around the value.");
  process.exit(1);
}

const host = parsed.hostname;
const port = Number(parsed.port || 5432);

console.log(`host : ${host}`);
console.log(`port : ${port}`);
console.log(`user : ${parsed.username}`);
console.log(`db   : ${parsed.pathname.slice(1)}`);
console.log("");

// 1. DNS
try {
  const { address, family } = await lookup(host);
  console.log(`[1] DNS      OK   ${address} (IPv${family})`);
} catch (err) {
  console.log(`[1] DNS      FAIL ${err.message}`);
  console.log("    The server cannot resolve the hostname. Nothing else will work.");
  process.exit(1);
}

// 2. Raw TCP to both pooler ports
const tryPort = (p) =>
  new Promise((resolve) => {
    const socket = connect({ host, port: p, timeout: 8000 });
    socket.on("connect", () => {
      socket.destroy();
      resolve({ port: p, ok: true });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ port: p, ok: false, why: "timed out (usually a firewall silently dropping it)" });
    });
    socket.on("error", (err) => {
      socket.destroy();
      resolve({ port: p, ok: false, why: err.message });
    });
  });

const ports = [...new Set([port, 6543, 5432])];
const results = [];
for (const p of ports) {
  const r = await tryPort(p);
  results.push(r);
  console.log(`[2] TCP ${String(p).padEnd(5)}${r.ok ? "OK" : "FAIL"} ${r.ok ? "" : r.why}`);
}

const openPorts = results.filter((r) => r.ok).map((r) => r.port);
if (openPorts.length === 0) {
  console.log("");
  console.log("Every database port is blocked from this server.");
  console.log("Ask the host to allow outbound 5432 and 6543 — until then this app");
  console.log("cannot reach Supabase from here at all.");
  process.exit(1);
}

// 3. A real Postgres handshake on the configured port, if it's open.
if (!openPorts.includes(port)) {
  console.log("");
  console.log(`Port ${port} is blocked, but ${openPorts.join(" and ")} is open.`);
  console.log(`Switch DB_URL to port ${openPorts[0]} and restart the app.`);
  process.exit(0);
}

// Next.js bundles the driver into .next/server, so it is deliberately absent
// from a standalone build's node_modules. Steps 1 and 2 above are the ones
// that answer the firewall question; this last step only runs where the
// package happens to be installed (e.g. a dev machine).
let postgres;
try {
  ({ default: postgres } = await import("postgres"));
} catch {
  console.log("");
  console.log("[3] SQL      SKIP  driver not installed here (normal on a standalone build)");
  console.log("");
  console.log("DNS and TCP both passed, so the network path to Postgres is open.");
  console.log("If the app still reports a database error, the cause is credentials");
  console.log("or configuration rather than connectivity.");
  process.exit(0);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
try {
  const [row] = await sql`SELECT current_database() AS db, now() AS at`;
  console.log("");
  console.log(`[3] SQL      OK   connected to "${row.db}" at ${row.at.toISOString()}`);
  console.log("");
  console.log("The database is reachable. If the app still errors, restart it so it");
  console.log("picks up the current environment variables.");
} catch (err) {
  console.log("");
  console.log(`[3] SQL      FAIL ${err.message}`);
  console.log("    The port is open but Postgres refused us — check the password and");
  console.log("    that the username still matches the pooler's expected format.");
} finally {
  await sql.end({ timeout: 5 });
}
