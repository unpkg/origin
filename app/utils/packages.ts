import * as fs from "fs/promises";
import { createReadStream } from "fs";
import * as os from "os";
import * as path from "path";
import type { Readable } from "stream";
import * as pacote from "pacote";

import { getContentType } from "./contentTypes";
import { getIntegrity } from "./integrity";

const pacoteOpts: pacote.Options = {
  cache: "./.cache-pacote",
  registry: process.env.NPM_REGISTRY || "https://registry.npmjs.org"
};

export async function getManifest(
  spec: string
): Promise<pacote.Manifest | null> {
  try {
    let manifest = await pacote.manifest(spec, pacoteOpts);
    return manifest;
  } catch (error: any) {
    if (error.code === "ETARGET" && error.type === "version") {
      return null;
    }

    throw error;
  }
}

async function extractPackage(spec: string): Promise<string> {
  let dest = path.join(os.tmpdir(), spec);

  try {
    await fs.access(dest);
    return await fs.realpath(dest);
  } catch (error) {
    await pacote.extract(spec, dest, pacoteOpts);
    return await fs.realpath(dest);
  }
}

export async function resolveFilename(
  spec: string,
  filename: string
): Promise<string | null> {
  let dir = await extractPackage(spec);

  try {
    // Use node's internal require.resolve machinery to resolve
    // the module from the filename in the URL. This means that a
    // pathname like `/lib` can resolve to `/lib.js` or `/lib/index.js`.
    let resolved = require.resolve("." + filename, { paths: [dir] });
    return "/" + path.relative(dir, resolved);
  } catch (error: any) {
    if (error.code === "MODULE_NOT_FOUND") {
      return null;
    }

    throw error;
  }
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

export async function getMetadata(
  spec: string,
  filename: string
): Promise<DirectoryMetadata | FileMetadata> {
  let dir = await extractPackage(spec);
  let file = path.join(dir, filename);
  let stat = await fs.stat(file);

  if (stat.isDirectory()) {
    let filenames = await fs.readdir(file);
    let fileMetadataPromises = filenames.map(filename =>
      getMetadata(spec, path.relative(dir, path.join(file, filename)))
    );

    return {
      type: "directory",
      path: filename.replace(/^\/*/, "/"),
      files: await Promise.all(fileMetadataPromises)
    };
  }

  let content = await fs.readFile(file);

  return {
    type: "file",
    path: filename.replace(/^\/*/, "/"),
    contentType: getContentType(file),
    integrity: getIntegrity(content),
    size: stat.size
  };
}

interface File {
  body: Readable;
  name: string;
  path: string;
  size: number;
  type: string;
}

export async function getFile(spec: string, filename: string): Promise<File> {
  let dir = await extractPackage(spec);
  let file = path.join(dir, filename);
  let stat = await fs.stat(file);

  return {
    body: createReadStream(file),
    name: path.basename(file),
    path: filename,
    size: stat.size,
    type: getContentType(file)
  };
}

export async function getModule(spec: string, filename: string): Promise<File> {
  let dir = await extractPackage(spec);
  let file = path.join(dir, filename);
  let stat = await fs.stat(file);

  return {
    body: createReadStream(file),
    name: path.basename(file),
    path: filename,
    size: stat.size,
    type: getContentType(file)
  };
}
