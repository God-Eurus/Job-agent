import path from "path";
import fs from "fs";

// The standalone production server runs with cwd = .next/standalone, so
// process.cwd() alone would point at a different data dir than `npm run dev`.
// start-prod.sh sets DATA_DIR to the project's data folder.
export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const RESUME_DIR = path.join(DATA_DIR, "resume");

export function ensureDataDirs() {
  fs.mkdirSync(RESUME_DIR, { recursive: true });
}
