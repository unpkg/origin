import * as semver from "semver";

export function parseSpec(spec: string): {
  packageName: string;
  version: string;
} {
  let [packageName, version] = spec.split("@");
  return { packageName, version };
}

export function isValidSpec(spec: string): boolean {
  return semver.valid(parseSpec(spec).version) != null;
}
