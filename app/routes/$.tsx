import type { LoaderFunction } from "remix";
import { json, redirect } from "remix";

import { getContentTypeHeader } from "~/utils/contentTypes";
import { parsePackagePathname } from "~/utils/packagePathnames";
import {
  getFile,
  getManifest,
  getMetadata,
  getModule,
  resolveFilename
} from "~/utils/packages";
import { oneMinute, oneYear } from "~/utils/seconds";

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
    return redirect("/"); // TODO: 404
  }

  // Redirect /react@17 => /react@17.0.0/index.js
  if (manifest.version !== parsed.packageVersion) {
    let manifestSpec = `${manifest.name}@${manifest.version}`;

    // Resolve the filename now as well to avoid a double redirect.
    let resolvedFilename = await resolveFilename(
      manifestSpec,
      parsed.filename || "/"
    );
    if (resolvedFilename == null) {
      return new Response(
        `Not found: "${parsed.filename}" in ${parsed.packageSpec}`,
        {
          status: 404
        }
      );
    }

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
    let metadata = await getMetadata(parsed.packageSpec, parsed.filename);
    return json(metadata, {
      headers: {
        "Cache-Control": `public, max-age=${oneYear}`
      }
    });
  }

  let resolvedFilename = await resolveFilename(
    parsed.packageSpec,
    parsed.filename || "/"
  );
  if (resolvedFilename == null) {
    return redirect("/"); // TODO: 404
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
    let file = await getFile(parsed.packageSpec, resolvedFilename);
    return new Response(file.body, {
      headers: {
        "Content-Type": getContentTypeHeader(file.type)
      }
    });
  }

  // Serve ?module requests
  if (url.searchParams.has("module")) {
    let mod = await getModule(parsed.packageSpec, resolvedFilename);
    return new Response(mod.body, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8"
      }
    });
  }

  // TODO: Serve HTML requests
  return { html: true };
};

// export default function Home() {
//   return <pre>{JSON.stringify(useLoaderData(), null, 2)}</pre>;
// }
