import type { LoaderFunction } from "remix";
import { json, redirect } from "remix";

import { getContentTypeHeader } from "~/utils/contentTypes";
import { parsePackagePathname } from "~/utils/packagePathnames";
import {
  addPackageToCache,
  resolveFilename,
  getMetadata,
  getFile
} from "~/utils/packagesDatabase";
import { getManifest } from "~/utils/registry";
import { oneMinute, oneYear } from "~/utils/seconds";

function notFound(what: string): Response {
  return new Response(`Not found: ${what}`, {
    status: 404,
    headers: {
      "Content-Type": "text/plain"
    }
  });
}

export let loader: LoaderFunction = async ({ request }) => {
  let url = new URL(request.url);

  // Remove trailing / from all URLs
  if (url.pathname.endsWith("/") && url.pathname !== "/") {
    let redirectTo = url.origin + url.pathname.replace(/\/+$/, "") + url.search;
    return redirect(redirectTo);
  }

  let parsed = parsePackagePathname(url.pathname);
  if (parsed == null) {
    return redirect("/");
  }

  let manifest = await getManifest(parsed.packageSpec);
  if (manifest == null) {
    return notFound(`package "${parsed.packageSpec}"`);
  }

  await addPackageToCache(manifest.name, manifest.version);

  // Redirect /react@17 => /react@17.0.0/index.js
  if (manifest.version !== parsed.packageVersion) {
    // Resolve the filename now as well to avoid a double redirect.
    let resolvedFilename = resolveFilename(
      manifest.name,
      manifest.version,
      parsed.filename
    );

    if (!resolvedFilename) {
      return notFound(`"${parsed.filename}" in ${parsed.packageSpec}`);
    }

    let manifestSpec = `${manifest.name}@${manifest.version}`;
    let redirectPathname = `/${manifestSpec}${resolvedFilename}`;
    let redirectTo = url.origin + redirectPathname + url.search;

    return redirect(redirectTo, {
      headers: {
        "Cache-Control": `public, max-age=${5 * oneMinute}`
      }
    });
  }

  // Serve ?meta requests
  // Note: Don't resolve the filename on ?meta requests. They must be specific.
  if (url.searchParams.has("meta")) {
    let metadata = getMetadata(
      parsed.packageName,
      parsed.packageVersion,
      parsed.filename
    );
    return json(metadata, {
      headers: {
        "Cache-Control": `public, max-age=${oneYear}`
      }
    });
  }

  let resolvedFilename = resolveFilename(
    parsed.packageName,
    parsed.packageVersion,
    parsed.filename
  );

  if (!resolvedFilename) {
    return notFound(`"${parsed.filename}" in ${parsed.packageSpec}`);
  }

  // Redirect /react@17.0.0 => /react@17.0.0/index.js
  if (resolvedFilename !== parsed.filename) {
    let redirectPathname = `/${parsed.packageSpec}${resolvedFilename}`;
    let redirectTo = url.origin + redirectPathname + url.search;
    return redirect(redirectTo, {
      headers: {
        "Cache-Control": `public, max-age=${oneYear}`
      }
    });
  }

  // Serve ?raw requests
  if (url.searchParams.has("raw")) {
    let file = getFile(
      parsed.packageName,
      parsed.packageVersion,
      resolvedFilename
    );

    if (!file) {
      // We shouldn't ever get here because we already resolved the filename...
      return notFound(`"${resolvedFilename}" in ${parsed.packageSpec}`);
    }

    return new Response(file.content, {
      headers: {
        "Content-Type": getContentTypeHeader(file.contentType)
      }
    });
  }

  // TODO: Serve ?module requests

  // TODO: Serve HTML requests
  return { html: true };
};

// export default function Home() {
//   return <pre>{JSON.stringify(useLoaderData(), null, 2)}</pre>;
// }
