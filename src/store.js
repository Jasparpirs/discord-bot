import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

// Shared JSON persistence for every data file (bookings, giveaways, reviews,
// modmail, purchases). Reads tolerate a missing/corrupt file by
// returning a fallback; writes are ATOMIC — the data is written to a temp
// sibling and renamed over the target, so a crash mid-write (e.g. Railway
// killing the container on redeploy) can never leave a half-written, corrupt
// file that would otherwise wipe the store on next load.

export function readJSON(file, fallback) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return data == null ? fallback : data;
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file); // atomic on the same filesystem
}

// Startup probe: can we actually write to the data directory? Used for the
// health line so a misconfigured volume is obvious in the logs.
export function checkWritable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.probe-${process.pid}`);
    writeFileSync(probe, "ok");
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
