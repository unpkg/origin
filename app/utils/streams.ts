import { createWriteStream } from "fs";
import type { Readable } from "stream";

export function bufferStream(stream: Readable): Promise<Buffer> {
  return new Promise((accept, reject) => {
    let chunks: Buffer[] = [];
    stream
      .on("error", reject)
      .on("data", chunk => chunks.push(chunk))
      .on("end", () => accept(Buffer.concat(chunks)));
  });
}

export function writeStreamToFile(
  stream: Readable,
  file: string
): Promise<void> {
  return new Promise((accept, reject) => {
    stream.on("end", accept).on("error", reject).pipe(createWriteStream(file));
  });
}
