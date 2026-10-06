import { readFileSync } from "node:fs";
import type { Connect, Plugin } from "vite";
import { APP_SHELL, clientPath, createAppRouteMatcher } from "./appRoutes";
import { notFoundPage, sitePages, type SitePage } from "./pages";
import { renderPage, renderSitemap } from "./render";

// Builds the public pages (/, /features, /privacy, ...) as static HTML next to
// the React app, and mirrors the production routing (vercel.json) in the dev
// and preview servers: public pages are served directly, app routes get
// app.html, and anything else gets the 404 page with a 404 status.

const cssPath = clientPath("site", "site.css");

const readCss = () =>
  readFileSync(cssPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>])\s*/g, "$1")
    .trim();

const pagesByPath = new Map<string, SitePage>(sitePages.map((page) => [page.path, page]));

const send = (res: Parameters<Connect.NextHandleFunction>[1], status: number, type: string, body: string) => {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
};

const createSiteMiddleware = (): Connect.NextHandleFunction => {
  const isAppRoute = createAppRouteMatcher();

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const url = new URL(req.url ?? "/", "http://localhost");
    const { pathname } = url;

    if (pathname === "/sitemap.xml") {
      return send(res, 200, "application/xml; charset=utf-8", renderSitemap());
    }

    const page = pagesByPath.get(pathname);
    if (page) {
      return send(res, 200, "text/html; charset=utf-8", renderPage(page, readCss()));
    }

    if (isAppRoute(pathname)) {
      req.url = `${APP_SHELL}${url.search}`;
      return next();
    }

    // Unknown page navigations get a real 404; module, asset and dev-server
    // requests (which have extensions or aren't documents) pass through.
    const isDocumentRequest =
      !pathname.startsWith("/@") &&
      !/\.[a-z0-9]+$/i.test(pathname) &&
      (req.headers.accept ?? "").includes("text/html");
    if (isDocumentRequest) {
      return send(res, 404, "text/html; charset=utf-8", renderPage(notFoundPage, readCss()));
    }

    return next();
  };
};

export const publicSitePlugin = (): Plugin => ({
  name: "movie-tracker-public-site",
  configureServer(server) {
    server.middlewares.use(createSiteMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(createSiteMiddleware());
  },
  generateBundle() {
    const css = readCss();
    for (const page of [...sitePages, notFoundPage]) {
      this.emitFile({ type: "asset", fileName: page.file, source: renderPage(page, css) });
    }
    this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemap() });
  },
});
