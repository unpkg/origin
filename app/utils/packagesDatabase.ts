import { oneGigabyte } from "./bytes";
import { getContentType } from "./contentTypes";
import { db } from "./data";
import { getIntegrity } from "./integrity";
import { extractPackage } from "./registry";
import { bufferStream } from "./streams";

const maxFilesSize = oneGigabyte * 20;

const selectPackage = db.prepare(`
SELECT name FROM packages
  WHERE name = ? AND version = ?
`);

export function hasPackage(packageName: string, version: string): boolean {
  return selectPackage.get(packageName, version) !== undefined;
}

const insertPackage = db.prepare(`
INSERT INTO
  packages (name, version)
  VALUES (?, ?)
`);

const insertFile = db.prepare(`
INSERT INTO
  files (content, content_type, integrity, package_name, package_version, filename, size)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const touchPackage = db.prepare(`
UPDATE packages
  SET last_used_at = CURRENT_TIME
  WHERE name = ? AND version = ?
`);

const selectTotalFilesSize = db.prepare(`
SELECT SUM(size) AS total_size FROM files
`);

const selectLeastUsedPackage = db.prepare(`
SELECT name, version FROM packages
  WHERE last_used_at = (SELECT last_used_at FROM packages ORDER BY last_used_at LIMIT 1)
`);

const deletePackage = db.prepare(`
DELETE FROM packages
  WHERE name = ? AND version = ?
`);

export async function addPackageToCache(
  packageName: string,
  version: string
): Promise<void> {
  if (hasPackage(packageName, version)) {
    touchPackage.run(packageName, version);
    console.log(
      db
        .prepare(
          `SELECT last_used_at FROM packages WHERE name = ? AND version = ?`
        )
        .get(packageName, version)
    );
    return;
  }

  insertPackage.run(packageName, version);

  let packageSpec = `${packageName}@${version}`;

  await extractPackage(packageSpec, async (filename, stream) => {
    let content = await bufferStream(stream);
    let contentType = getContentType(filename);
    let integrity = getIntegrity(content);
    let size = content.length;

    insertFile.run(
      content,
      contentType,
      integrity,
      packageName,
      version,
      filename,
      size
    );
  });

  // Automatically purge old packages from the cache when it gets too big.
  while (selectTotalFilesSize.get().total_size > maxFilesSize) {
    let leastUsedPackage = selectLeastUsedPackage.get();

    if (
      leastUsedPackage.name === packageName &&
      leastUsedPackage.version === version
    ) {
      // Be careful to NOT delete the package we just added!
      break;
    }

    deletePackage.run(leastUsedPackage.name, leastUsedPackage.version);
  }
}

const selectFilename = db.prepare(`
SELECT filename FROM files
  WHERE package_name = ? AND package_version = ?
`);

export function resolveFilename(
  packageName: string,
  version: string,
  filename: string
): string | void {
  let allFilenames = selectFilename
    .all(packageName, version)
    .reduce((memo, row) => {
      memo[row.filename] = row.filename;
      return memo;
    }, {} as Record<string, string>);

  return (
    findFile(filename, allFilenames) ||
    findInDirectory(packageName, version, filename, allFilenames)
  );
}

function findFile(
  filename: string,
  allFilenames: Record<string, string>
): string | void {
  if (filename === "") return;

  return (
    allFilenames[filename] ||
    allFilenames[`${filename}.js`] ||
    allFilenames[`${filename}.json`]
  );
}

const selectContent = db.prepare(`
SELECT content FROM files
  WHERE package_name = ? AND package_version = ? AND filename = ?
`);

function getJson(packageName: string, version: string, filename: string): any {
  let result = selectContent.get(packageName, version, filename);
  return JSON.parse(result.content);
}

function findInDirectory(
  packageName: string,
  version: string,
  filename: string,
  allFilenames: Record<string, string>
): string | void {
  if (allFilenames[`${filename}/package.json`]) {
    let packageJson = getJson(packageName, version, `${filename}/package.json`);

    if (packageJson.main) {
      let mainFilename = `/${filename}/${packageJson.main}`.replace(
        /\/\/+/g,
        "/"
      );

      return (
        findFile(mainFilename, allFilenames) ||
        findIndex(mainFilename, allFilenames)
      );
    }
  }

  return findIndex(filename, allFilenames);
}

function findIndex(
  filename: string,
  allFilenames: Record<string, string>
): string | void {
  return (
    allFilenames[`${filename}/index.js`] ||
    allFilenames[`${filename}/index.json`]
  );
}

interface DirectoryMetadata {
  type: "directory";
  path: string;
  files: (DirectoryMetadata | FileMetadata)[];
}

interface FileMetadata {
  type: "file";
  path: string;
  contentType: string;
  integrity: string;
  size: number;
}

const selectFiles = db.prepare(`
SELECT content_type, filename, integrity, size FROM files
  WHERE package_name = ? AND package_version = ?
`);

export function getMetadata(
  packageName: string,
  version: string,
  filename = "/"
): DirectoryMetadata | FileMetadata {
  let files = selectFiles.all(packageName, version);
  return createMetadata(filename || "/", files);
}

function createMetadata(
  baseFilename: string,
  files: {
    content_type: string;
    filename: string;
    integrity: string;
    size: number;
  }[]
): DirectoryMetadata | FileMetadata {
  let file = files.find(file => file.filename === baseFilename);

  if (file) {
    return {
      type: "file",
      path: file.filename,
      contentType: file.content_type,
      integrity: file.integrity,
      size: file.size
    };
  }

  let baseDirname = baseFilename === "/" ? "/" : `${baseFilename}/`;
  let dirFilenames = files.reduce((memo, file) => {
    if (file.filename.startsWith(baseDirname)) {
      let name =
        baseDirname + file.filename.slice(baseDirname.length).split("/")[0];
      if (!memo.includes(name)) {
        memo.push(name);
      }
    }
    return memo;
  }, [] as string[]);

  return {
    type: "directory",
    path: baseFilename,
    files: dirFilenames.map(name => createMetadata(name, files))
  };
}

export interface File {
  content: Buffer;
  contentType: string;
  filename: string;
  integrity: string;
  size: number;
}

const selectFile = db.prepare(`
SELECT content, content_type, filename, integrity, size FROM files
  WHERE package_name = ? AND package_version = ? AND filename = ?
`);

export function getFile(
  packageName: string,
  version: string,
  filename: string
): File | null {
  let result = selectFile.get(packageName, version, filename);

  if (result === undefined) return null;

  return {
    content: result.content,
    contentType: result.content_type,
    integrity: result.integrity,
    filename: result.filename,
    size: result.size
  };
}

// async function doStuff() {
//   let packageName = "react";
//   let version = "15.7.0";

//   await addPackageToCache(packageName, version);

//   let file = getFile(packageName, version, "/package.json");
//   console.log({ file });

//   // purgePackageFromCache(packageName, version);

//   // file = getFile(packageName, version, "/package.json");
//   // console.log({ file });

//   // let metadata = getMetadata(packageName, version, "/cjs");
//   // console.log(JSON.stringify({ metadata }, null, 2));
//   console.log(selectTotalFilesSize.get());
// }

// doStuff();
