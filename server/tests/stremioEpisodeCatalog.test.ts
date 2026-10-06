import assert from "node:assert/strict";
import { test } from "node:test";
import { createStremioEpisodeCatalog } from "../services/integrations/stremioEpisodeCatalog";

test("Cinemeta adapter uses a fixed public endpoint without credentials and orders specials before episodes", async () => {
  const catalog = createStremioEpisodeCatalog({ fetchImpl: (async (url, init) => {
    assert.equal(String(url), "https://v3-cinemeta.strem.io/meta/series/tt13111078.json");
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    return new Response(JSON.stringify({ meta: { videos: [
      { id: "tt13111078:1:2", season: 1, episode: 2, released: "2023-07-23T00:00:00Z" },
      { id: "tt13111078:0:1", season: 0, episode: 1, released: null },
      { id: "tt13111078:1:1", season: 1, episode: 1 },
    ] } }));
  }) as typeof fetch });
  assert.deepEqual(await catalog.getOrderedVideoIds("tt13111078"), ["tt13111078:0:1", "tt13111078:1:1", "tt13111078:1:2"]);
});

test("Cinemeta adapter rejects inconsistent, duplicate, malformed, and unavailable catalogs", async () => {
  for (const videos of [null, [{ id: "tt13111078:1:1", season: 2, episode: 1 }], [{ id: "addon:1:1", season: 1, episode: 1 }], [{ id: "tt13111078:1:1", season: 1, episode: 1 }, { id: "tt13111078:1:1", season: 1, episode: 1 }]]) {
    await assert.rejects(createStremioEpisodeCatalog({ fetchImpl: (async () => new Response(JSON.stringify({ meta: { videos } }))) as typeof fetch }).getOrderedVideoIds("tt13111078"), /provider_protocol_error/);
  }
  await assert.rejects(createStremioEpisodeCatalog({ fetchImpl: (async () => new Response("unavailable", { status: 503 })) as typeof fetch }).getOrderedVideoIds("tt13111078"), /provider_unavailable/);
});
