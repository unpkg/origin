import * as stream from "stream";
import * as tar from "tar-stream";
import gunzip from "gunzip-maybe";
import pacote from "pacote";

const pacoteOpts: pacote.PacoteOptions = {
  registry: process.env.NPM_REGISTRY || "https://registry.npmjs.org"
};

function isNotFoundError(error: any): boolean {
  return error.code === "E404";
}

async function streamTarball<T>(
  spec: string,
  streamHandler: (stream: stream.Readable) => Promise<T>
): Promise<T | null> {
  try {
    return await pacote.tarball.stream<T>(spec, streamHandler, pacoteOpts);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function extractTarStream(
  stream: stream.Readable,
  entryHandler: (header: tar.Headers, stream: stream.Readable) => Promise<void>
) {
  return new Promise((accept, reject) => {
    stream
      .pipe(gunzip())
      .pipe(tar.extract())
      .on("entry", (header, stream, next) => {
        entryHandler(header, stream).then(next, next);
      })
      .on("error", reject)
      .on("finish", accept);
  });
}

function drainStream(stream: stream.Readable) {
  return new Promise(accept => {
    stream.resume();
    stream.on("end", accept);
  });
}

function getFilePath(header: tar.Headers) {
  // Most packages have header names that look like `package/index.js`
  // so we shorten that to just `/index.js` here. A few packages use a
  // prefix other than `package/`. e.g. the firebase package uses the
  // `firebase_npm/` prefix. So we just strip the first dir name.
  return header.name.replace(/^[^/]+\/?/, "/");
}

export async function extractPackage(
  spec: string,
  fileHandler: (
    path: string,
    stream: stream.Readable
  ) => unknown | Promise<unknown>
): Promise<void> {
  await streamTarball(spec, async (stream: stream.Readable) => {
    await extractTarStream(stream, async (header, stream) => {
      if (header.type === "file") {
        await fileHandler(getFilePath(header), stream);
      } else {
        await drainStream(stream);
      }
    });
  });
}

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
