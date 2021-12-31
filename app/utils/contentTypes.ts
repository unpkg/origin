import * as path from "path";
import * as mime from "mime";

mime.define(
  {
    "text/plain": [
      "authors",
      "changes",
      "license",
      "makefile",
      "patents",
      "readme",
      "ts",
      "flow"
    ]
  },
  /* force */ true
);

const textFiles = /\/?(\.[a-z]*rc|\.git[a-z]*|\.[a-z]*ignore|\.lock)$/i;

export function getContentType(file: string): string {
  let name = path.basename(file);
  return textFiles.test(name)
    ? "text/plain"
    : mime.getType(name) || "text/plain";
}

export function getContentTypeHeader(contentType: string): string {
  return contentType === "application/javascript"
    ? contentType + "; charset=utf-8"
    : contentType;
}
