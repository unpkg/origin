const packagePathnameFormat = /^\/((?:@[^/@]+\/)?[^/@]+)(?:@([^/]+))?(\/.*)?$/;

interface ParsedPathname {
  packageName: string;
  packageVersion: string;
  packageSpec: string;
  filename: string;
}

export function parsePackagePathname(pathname: string): ParsedPathname | null {
  try {
    pathname = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }

  let match = packagePathnameFormat.exec(pathname);

  // Disallow invalid pathnames.
  if (match == null) return null;

  let packageName = match[1];
  let packageVersion = match[2] || "latest";
  let filename = (match[3] || "").replace(/\/\/+/g, "/");

  return {
    // If the pathname is /@scope/name@version/file.js:
    packageName, // @scope/name
    packageVersion, // version
    packageSpec: `${packageName}@${packageVersion}`, // @scope/name@version
    filename // /file.js
  };
}

export function createPackagePathname({
  packageName,
  packageVersion,
  filename
}: {
  packageName: string;
  packageVersion: string;
  filename: string;
}): string {
  return `/${packageName}@${packageVersion}${filename}`;
}
