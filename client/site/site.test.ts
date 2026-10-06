import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { clientPath, createAppRouteMatcher, readAppRouteSources, vercelSourceToRegExp } from "./appRoutes";
import { notFoundPage, sitePages } from "./pages";
import { renderPage, renderSitemap } from "./render";

const appSource = readFileSync(clientPath("src", "App.tsx"), "utf8");
const appRoutePaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
const isAppRoute = createAppRouteMatcher();

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const rendered = sitePages.map((page) => ({ page, doc: parse(renderPage(page, "")) }));

describe("routing between public pages and the app", () => {
  test("every app route except / is served by the app shell in production", () => {
    const concrete = appRoutePaths
      .filter((path) => path !== "/")
      .map((path) => path.replace(/:\w+/g, "example"));
    expect(concrete.length).toBeGreaterThan(10);
    for (const path of concrete) {
      expect(isAppRoute(path), path).toBe(true);
    }
  });

  test("public pages are never routed to the app shell", () => {
    for (const page of sitePages) {
      expect(isAppRoute(page.path), page.path).toBe(false);
    }
    expect(isAppRoute("/no-such-page")).toBe(false);
  });

  test("wildcard sources match the bare prefix and nested paths only", () => {
    const pattern = vercelSourceToRegExp("/history/:path*");
    expect(pattern.test("/history")).toBe(true);
    expect(pattern.test("/history/tv/1399")).toBe(true);
    expect(pattern.test("/historyx")).toBe(false);
  });

  test("vercel.json lists app routes as rewrites to app.html", () => {
    expect(readAppRouteSources()).toContain("/login");
  });
});

describe("public page metadata", () => {
  test("titles, descriptions and canonical URLs are unique and well formed", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const { page, doc } of rendered) {
      const title = doc.title;
      const description = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");

      expect(title.length, page.path).toBeLessThanOrEqual(70);
      expect(description.length, page.path).toBeGreaterThan(70);
      expect(description.length, page.path).toBeLessThanOrEqual(160);
      expect(canonical).toBe(`https://movietrk.com${page.path}`);
      expect(doc.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(canonical);
      expect(doc.querySelector('meta[name="robots"]')).toBeNull();
      expect(doc.querySelectorAll("h1")).toHaveLength(1);
      titles.add(title);
      descriptions.add(description);
    }
    expect(titles.size).toBe(sitePages.length);
    expect(descriptions.size).toBe(sitePages.length);
  });

  test("structured data is valid JSON with the expected types", () => {
    const home = rendered.find(({ page }) => page.path === "/")!;
    const scripts = home.doc.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0].textContent ?? "");
    expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual([
      "WebSite",
      "WebApplication",
    ]);
  });

  test("the 404 page is not indexable", () => {
    const doc = parse(renderPage(notFoundPage, ""));
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

describe("sitemap.xml", () => {
  const xml = new DOMParser().parseFromString(renderSitemap(), "application/xml");
  const locs = [...xml.getElementsByTagName("loc")].map((node) => node.textContent);

  test("is well-formed and lists exactly the indexable public pages", () => {
    expect(xml.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(locs).toEqual(sitePages.map((page) => `https://movietrk.com${page.path}`));
  });

  test("never lists private, utility or app routes", () => {
    for (const loc of locs) {
      const path = new URL(loc!).pathname;
      expect(isAppRoute(path), path).toBe(false);
    }
  });
});
