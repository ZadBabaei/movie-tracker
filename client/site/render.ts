import { HEADER_LOGO, OG_IMAGE, SITE_NAME, SITE_ORIGIN, absoluteUrl } from "./siteConfig";
import { pageUrl, sitePages, type SitePage } from "./pages";

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const headerLinks = [
  { href: "/features", label: "Features" },
  { href: "/movie-tracker", label: "Movies" },
  { href: "/tv-series-tracker", label: "TV series" },
  { href: "/watch-history", label: "Watch history" },
  { href: "/about", label: "About" },
];

const navLink = (href: string, label: string, current: string) =>
  `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a>`;

const renderHeader = (current: string) => `
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${SITE_NAME} home">
      <img src="${HEADER_LOGO.path}" width="${HEADER_LOGO.width}" height="${HEADER_LOGO.height}" alt="${SITE_NAME}" />
    </a>
    <nav class="site-nav" aria-label="Main">
      ${headerLinks.map((link) => navLink(link.href, link.label, current)).join("\n      ")}
    </nav>
    <div class="header-actions">
      <a class="link-quiet" href="/login">Sign in</a>
      <a class="btn btn-primary btn-small" href="/signup">Get started</a>
    </div>
  </div>
</header>`;

const renderFooter = () => `
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <p class="footer-name">${SITE_NAME}</p>
      <p class="footer-note">Movie and TV information, posters and artwork from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
    <nav aria-label="Footer">
      <a href="/features">Features</a>
      <a href="/movie-tracker">Movie tracker</a>
      <a href="/tv-series-tracker">TV series tracker</a>
      <a href="/watch-history">Watch history</a>
      <a href="/about">About</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/login">Sign in</a>
    </nav>
  </div>
</footer>`;

const renderJsonLd = (data: Record<string, unknown>) =>
  // Escape "<" so content can never close the script element early.
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

export const renderPage = (page: SitePage, css: string) => {
  const url = pageUrl(page);
  const ogImage = `${SITE_ORIGIN}${OG_IMAGE.path}`;
  const title = escapeAttr(page.title);
  const description = escapeAttr(page.description);
  const indexMeta = page.indexable
    ? `<link rel="canonical" href="${url}" />`
    : `<meta name="robots" content="noindex" />`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
${indexMeta}
<meta name="theme-color" content="#021a08" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:locale" content="en_US" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
${page.indexable ? `<meta property="og:url" content="${url}" />\n` : ""}<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="${OG_IMAGE.width}" />
<meta property="og:image:height" content="${OG_IMAGE.height}" />
<meta property="og:image:alt" content="${escapeAttr(OG_IMAGE.alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="twitter:image:alt" content="${escapeAttr(OG_IMAGE.alt)}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/movie-tracker-icon-32.png" type="image/png" sizes="32x32" />
<link rel="apple-touch-icon" href="/logo192.png" />
<link rel="manifest" href="/manifest.json" />
<style>${css}</style>
${page.head ?? ""}${page.jsonLd ? renderJsonLd(page.jsonLd) : ""}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${renderHeader(page.path)}
<main id="main" class="wrap">
${page.body.trim()}
</main>
${renderFooter()}
</body>
</html>
`;
};

export const renderSitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitePages
  .filter((page) => page.indexable)
  .map((page) => `  <url><loc>${absoluteUrl(page.path)}</loc></url>`)
  .join("\n")}
</urlset>
`;
