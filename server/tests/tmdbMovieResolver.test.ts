import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTmdbMovieResolver,
  TmdbMovieResolverError,
} from "../services/integrations/tmdbMovieResolver";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorCode = (code: string) => (error: unknown) =>
  error instanceof TmdbMovieResolverError && error.code === code;

const movieResult = (overrides: Record<string, unknown> = {}) => ({
  id: 329865,
  title: "Arrival",
  poster_path: "/arrival.jpg",
  vote_average: 7.6,
  overview: "must not escape",
  ...overrides,
});

test("TMDB resolver uses HTTPS /find with IMDb source, language, and server API key", async () => {
  let requestedUrl: URL | undefined;
  let requestedInit: RequestInit | undefined;
  const resolver = createTmdbMovieResolver({
    apiKey: "server-test-key",
    fetchImpl: (async (url, init) => {
      requestedUrl = new URL(String(url));
      requestedInit = init;
      return jsonResponse({ movie_results: [movieResult()] });
    }) as typeof fetch,
  });

  const result = await resolver.resolveByImdbId("tt2543164");
  assert.equal(requestedUrl?.protocol, "https:");
  assert.equal(requestedUrl?.pathname, "/3/find/tt2543164");
  assert.equal(requestedUrl?.searchParams.get("external_source"), "imdb_id");
  assert.equal(requestedUrl?.searchParams.get("language"), "en-US");
  assert.equal(requestedUrl?.searchParams.get("api_key"), "server-test-key");
  assert.equal(requestedInit?.method, "GET");
  assert.deepEqual(result, {
    tmdbId: 329865,
    title: "Arrival",
    posterPath: "/arrival.jpg",
    voteAverage: 7.6,
  });
  assert.equal(JSON.stringify(result).includes("must not escape"), false);
});

test("TMDB resolver reads TMDB_API_KEY from the server environment at request time", async () => {
  const previous = process.env.TMDB_API_KEY;
  let observedKey: string | null = null;
  try {
    delete process.env.TMDB_API_KEY;
    const resolver = createTmdbMovieResolver({
      fetchImpl: (async (url) => {
        observedKey = new URL(String(url)).searchParams.get("api_key");
        return jsonResponse({ movie_results: [] });
      }) as typeof fetch,
    });
    process.env.TMDB_API_KEY = "late-loaded-server-key";
    await resolver.resolveByImdbId("tt2543164");
    assert.equal(observedKey, "late-loaded-server-key");
  } finally {
    if (previous === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = previous;
  }
});

test("TMDB resolver treats zero movie and TV-only results as movie missing", async () => {
  for (const payload of [
    { movie_results: [] },
    { movie_results: [], tv_results: [{ id: 1, name: "A show" }] },
  ]) {
    const resolver = createTmdbMovieResolver({
      apiKey: "server-test-key",
      fetchImpl: (async () => jsonResponse(payload)) as typeof fetch,
    });
    assert.equal(await resolver.resolveByImdbId("tt2543164"), null);
  }
});

test("TMDB resolver fails closed on multiple movie results", async () => {
  const resolver = createTmdbMovieResolver({
    apiKey: "server-test-key",
    fetchImpl: (async () =>
      jsonResponse({ movie_results: [movieResult(), movieResult({ id: 2 })] })) as typeof fetch,
  });
  await assert.rejects(
    resolver.resolveByImdbId("tt2543164"),
    errorCode("tmdb_ambiguous_match")
  );
});

test("TMDB resolver normalizes malformed responses without exposing provider payloads", async () => {
  const secretPayload = "raw-provider-detail-must-not-leak";
  for (const response of [
    jsonResponse({ results: [] }),
    jsonResponse({ movie_results: [{ id: "bad", title: secretPayload }] }),
    new Response(secretPayload, { status: 200 }),
  ]) {
    const resolver = createTmdbMovieResolver({
      apiKey: "server-test-key",
      fetchImpl: (async () => response.clone()) as typeof fetch,
    });
    await assert.rejects(resolver.resolveByImdbId("tt2543164"), (error: unknown) => {
      assert.equal(errorCode("tmdb_protocol_error")(error), true);
      assert.equal(String(error).includes(secretPayload), false);
      return true;
    });
  }
});

test("TMDB resolver normalizes network, rate-limit, and provider failures", async () => {
  const cases: Array<[typeof fetch, string]> = [
    [
      (async () => {
        throw new Error("socket detail");
      }) as typeof fetch,
      "tmdb_network_error",
    ],
    [(async () => jsonResponse({ status_message: "slow down" }, 429)) as typeof fetch, "tmdb_rate_limited"],
    [(async () => jsonResponse({ status_message: "down" }, 503)) as typeof fetch, "tmdb_unavailable"],
  ];
  for (const [fetchImpl, code] of cases) {
    const resolver = createTmdbMovieResolver({ apiKey: "server-test-key", fetchImpl });
    await assert.rejects(resolver.resolveByImdbId("tt2543164"), errorCode(code));
  }
});

test("TMDB resolver aborts requests at the configured timeout", async () => {
  const resolver = createTmdbMovieResolver({
    apiKey: "server-test-key",
    timeoutMs: 5,
    fetchImpl: ((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timeout detail")));
      })) as typeof fetch,
  });
  await assert.rejects(
    resolver.resolveByImdbId("tt2543164"),
    errorCode("tmdb_network_error")
  );
});

test("TMDB resolver rejects unsafe identifiers and missing or non-HTTPS configuration", async () => {
  let requests = 0;
  const resolver = createTmdbMovieResolver({
    apiKey: "",
    fetchImpl: (async () => {
      requests += 1;
      return jsonResponse({ movie_results: [] });
    }) as typeof fetch,
  });
  await assert.rejects(
    resolver.resolveByImdbId("tt2543164"),
    errorCode("tmdb_configuration_missing")
  );
  await assert.rejects(
    resolver.resolveByImdbId("../../secret"),
    errorCode("tmdb_invalid_imdb_id")
  );
  assert.equal(requests, 0);
  assert.throws(
    () => createTmdbMovieResolver({ apiKey: "key", baseUrl: "http://api.example.test" }),
    errorCode("tmdb_configuration_missing")
  );
});
