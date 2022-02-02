import * as path from "path";
import sqlite from "better-sqlite3";
import { removeSync } from "fs-extra";

let db: sqlite.Database;
if (process.env.NODE_ENV === "production") {
  // Database is on an ephemeral volume mounted at /data.
  let file = "/data/packages_cache.db";
  // Blow away any existing database because the schema might
  // have changed. It's just a cache anyway, so it will heal.
  removeSync(file);
  db = new sqlite(file);
} else {
  // Keep this database around across dev server restarts so
  // we don't have to redownload all packages every time. If
  // the database schema changes, delete this file manually.
  let file = path.resolve(__dirname, "../data/packages_cache.db");
  db = new sqlite(file, { verbose: console.log });
}

db.exec(`
CREATE TABLE IF NOT EXISTS packages (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  last_used_at INTEGER DEFAULT CURRENT_TIME,

  PRIMARY KEY (name, version)
);

CREATE INDEX IF NOT EXISTS packages_used_at
  ON packages (last_used_at);

CREATE TABLE IF NOT EXISTS files (
  content BLOB NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  integrity TEXT NOT NULL,
  package_name TEXT NOT NULL,
  package_version TEXT NOT NULL,
  size INTEGER NOT NULL,

  PRIMARY KEY (package_name, package_version, filename),

  CONSTRAINT fk_package
    FOREIGN KEY (package_name, package_version)
    REFERENCES packages (name, version)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS files_by_package
  ON files (package_name, package_version);
`);

export { db };
