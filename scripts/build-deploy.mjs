// Build and assemble an upload-ready folder for self-hosting (a bare VPS,
// cPanel/Passenger, anywhere you deploy by uploading rather than by pushing).
//
//   npm run deploy:build
//
// Produces ./deploy containing everything the server needs and nothing it
// doesn't: the standalone server, its pruned node_modules, the static assets
// and the public folder. Zip that folder and upload it — the server never runs
// `npm install` or `next build`.
//
// NOTE: NEXT_PUBLIC_* values are baked into the client bundle at build time, so
// they must already be correct in .env.local BEFORE `npm run build`. Setting
// them on the server afterwards has no effect on what the browser receives.
import { cp, rm, mkdir, access, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = join(ROOT, "deploy");
const STANDALONE = join(ROOT, ".next", "standalone");

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

// Which Supabase project the *browser* authenticates against is decided here,
// at build time, because NEXT_PUBLIC_* is compiled into the bundle. Build with
// the wrong env file active and the only visible symptom is Google sign-in
// redirecting to that project's Site URL — which is how a prod deploy ended up
// bouncing users to http://localhost:3000. Print it so it can't hide again.
async function readEnvFile(name) {
  const out = {};
  try {
    const text = await readFile(join(ROOT, name), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Missing env file is fine — a later one in the chain may define it.
  }
  return out;
}

// Same precedence Next applies to a production build: first file to define a
// key wins.
const resolved = {};
for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  for (const [key, value] of Object.entries(await readEnvFile(file))) {
    if (!(key in resolved)) resolved[key] = { value, file };
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? { value: process.env.NEXT_PUBLIC_SUPABASE_URL, file: "shell env" }
  : resolved.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl?.value) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL is not set in any env file, so the browser bundle\n" +
      "would ship without a Supabase project. Aborting."
  );
  process.exit(1);
}

const projectRef = /https?:\/\/([^.]+)\./.exec(supabaseUrl.value)?.[1] ?? "unknown";
console.log("Baking into the browser bundle:");
console.log(`  Supabase project : ${projectRef}   (from ${supabaseUrl.file})`);
console.log(`  Site URL         : ${resolved.NEXT_PUBLIC_SITE_URL?.value ?? "(unset)"}`);
console.log(
  `  → Google sign-in returns via THIS project's Site URL / Redirect URLs.\n` +
    `    Check them at https://supabase.com/dashboard/project/${projectRef}/auth/url-configuration\n`
);

// Build here rather than in the npm script so BUILD_STANDALONE can be set
// without a cross-platform env-var helper.
console.log("Building with BUILD_STANDALONE=true …\n");
const build = spawnSync("npx", ["next", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BUILD_STANDALONE: "true" },
});

if (build.status !== 0) {
  console.error("\nBuild failed — nothing assembled.");
  process.exit(build.status ?? 1);
}

if (!(await exists(STANDALONE))) {
  console.error(
    'No .next/standalone found even though the build succeeded.\n' +
      'Check that next.config.ts honours BUILD_STANDALONE.'
  );
  process.exit(1);
}

console.log("Assembling ./deploy …");
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1. The standalone server + its pruned node_modules.
await cp(STANDALONE, OUT, { recursive: true });

// 2. Static assets — standalone deliberately excludes these two.
await cp(join(ROOT, ".next", "static"), join(OUT, ".next", "static"), { recursive: true });
if (await exists(join(ROOT, "public"))) {
  await cp(join(ROOT, "public"), join(OUT, "public"), { recursive: true });
}

// 3. Passenger (cPanel) reads the startup file from the app root and provides
//    PORT itself; server.js already honours it. This marker just makes the
//    upload self-describing.
await writeFile(
  join(OUT, "DEPLOY-README.txt"),
  [
    "Upload the CONTENTS of this folder to your app root on the server.",
    "",
    "cPanel → Setup Node.js App:",
    "  Application startup file : server.js",
    "  Application mode         : Production",
    "",
    "Set server-side env vars in the cPanel UI (never upload .env.local):",
    "  DB_URL, SUPABASE_SERVICE_ROLE_KEY,",
    "  SOLID_PAY_API_KEY, SOLID_PAY_MERCHANT_NO, SOLID_PAY_BASE_URL,",
    "  APP_BASE_URL, SOLID_PAY_CALLBACK_IPS, SOLID_PAY_ENFORCE_CALLBACK_IP",
    "",
    "NEXT_PUBLIC_* values are already compiled into this build.",
    `Built: ${new Date().toISOString()}`,
  ].join("\n"),
  "utf8"
);

// 4. Archive it. Deliberately tar and not zip: PowerShell's Compress-Archive
//    (.NET Framework) writes backslash separators, which Linux extracts as one
//    flat directory of files literally named ".next\server\app\page.js".
//    bsdtar ships with Windows 10+ and gets the paths right.
const archive = join(ROOT, "deploy.tar.gz");
await rm(archive, { force: true });

// Relative paths, not absolute: GNU tar reads the colon in "D:\..." as a
// remote host spec and fails. shell:true because Windows spawn won't resolve
// `tar` to `tar.exe` on its own.
const tar = spawnSync("tar", ["-czf", "deploy.tar.gz", "-C", "deploy", "."], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

if (tar.error || tar.status !== 0) {
  console.log("\nDone — ./deploy is ready.");
  console.log("`tar` was unavailable, so archive it yourself before uploading:");
  console.log("  tar -czf deploy.tar.gz -C deploy .");
  process.exit(0);
}

const { size } = await stat(archive);
console.log(`\nDone. deploy.tar.gz (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log("Upload it to your application root and extract it there.");
