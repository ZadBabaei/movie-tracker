import React, { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { isTmdbError, MediaSearchResult, searchMedia, tmdbImageUrl } from "../api/tmdb";
import "./HistoryMediaSearch.css";

/**
 * Search box for "Add to History": one query, movies and TV series in one
 * provider-ranked list, each row badged with its kind. History-only — the
 * movie-only SearchBar used by Watchlist / polls is untouched.
 */

export type HistoryMediaSearchResult = MediaSearchResult;

interface HistoryMediaSearchProps {
  onSelect: (result: HistoryMediaSearchResult) => void;
  autoFocus?: boolean;
  placeholder?: string;
  maxResults?: number;
}

export const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

const friendlyError = (error: unknown) => {
  if (isTmdbError(error)) {
    if (error.kind === "network") return "Couldn't reach TMDB. Check your connection and try again.";
    if (error.kind === "rate_limited") return "TMDB is busy right now. Please try again in a moment.";
    if (error.kind === "config") return "Search isn't configured on this deployment.";
  }
  return "Search failed. Please try again.";
};

const resultMeta = (result: HistoryMediaSearchResult) => {
  const parts = [result.year ? String(result.year) : "Year unknown"];
  if (result.kind === "tv" && result.originCountry.length) parts.push(result.originCountry.join(", "));
  return parts.join(" · ");
};

const HistoryMediaSearch: React.FC<HistoryMediaSearchProps> = ({
  onSelect,
  autoFocus = true,
  placeholder = "Search movies and TV series…",
  maxResults = 8,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryMediaSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setError("");
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const page = await searchMedia(trimmed, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResults(page.results.slice(0, maxResults));
      } catch (caught) {
        // A superseded keystroke is not an error the user needs to hear about.
        if (controller.signal.aborted || (isTmdbError(caught) && caught.kind === "aborted")) return;
        setResults([]);
        setError(friendlyError(caught));
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, maxResults, query]);

  const ready = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className="history-media-search">
      <label className="history-media-search-box">
        <FaSearch aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Search movies and TV series to add to history"
          autoComplete="off"
          autoFocus={autoFocus}
          data-testid="history-media-search-input"
        />
      </label>

      {searching ? (
        <p className="history-media-search-status" role="status">Searching…</p>
      ) : error ? (
        <div className="history-media-search-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : ready && results.length === 0 ? (
        <p className="history-media-search-status">No movies or series found for “{query.trim()}”.</p>
      ) : results.length > 0 ? (
        <ul className="history-media-search-results" aria-label="Search results">
          {results.map((result) => (
            <li key={`${result.kind}-${result.tmdbId}`}>
              <button
                type="button"
                className={`history-media-result history-media-result--${result.kind}`}
                onClick={() => onSelect(result)}
                data-testid="history-media-result"
                data-kind={result.kind}
              >
                {result.posterPath ? (
                  <img src={tmdbImageUrl(result.posterPath, "w185")} alt="" />
                ) : (
                  <span className="history-media-result-noart" aria-hidden="true" />
                )}
                <span className="history-media-result-body">
                  <span className="history-media-result-head">
                    <span className={`history-media-badge history-media-badge--${result.kind}`}>{result.kind === "tv" ? "TV" : "Movie"}</span>
                    <strong>{result.title}</strong>
                  </span>
                  <span className="history-media-result-meta">{resultMeta(result)}</span>
                  {result.overview && <small>{result.overview}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="history-media-search-status">Type at least {MIN_QUERY_LENGTH} characters to search movies and TV series.</p>
      )}
    </div>
  );
};

export default HistoryMediaSearch;
