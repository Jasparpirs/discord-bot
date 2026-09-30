import { join } from "node:path";
import { DATA_DIR } from "./config.js";
import { readJSON, writeJSON } from "./store.js";

const FILE = join(DATA_DIR, "reviews.json");

function loadStats() {
  const s = readJSON(FILE, {});
  return { count: s.count || 0, sum: s.sum || 0, dist: s.dist || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
}
function saveStats(s) {
  writeJSON(FILE, s);
}

// { count, avg, dist } — powers the review figures in the /stats dashboard.
export function getStats() {
  const s = loadStats();
  return { count: s.count, avg: s.count ? s.sum / s.count : 0, dist: s.dist };
}

export function addReview(stars) {
  const s = loadStats();
  s.count += 1;
  s.sum += stars;
  const k = Math.max(1, Math.min(5, Math.round(stars)));
  s.dist[k] = (s.dist[k] || 0) + 1;
  saveStats(s);
  return { count: s.count, avg: s.sum / s.count, dist: s.dist };
}
