// Fails the build if the team's EPUB check reached the published files. Authors
// never get an EPUB export, and next.config.ts keeps it out only while the import
// is spelled the way the alias expects.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const published = ".next/static";
const leaks = readdirSync(published, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .filter((file) => readFileSync(file).includes("application/epub+zip"));

if (leaks.length) {
  console.error("The EPUB check is in the published files:", leaks);
  process.exit(1);
}
