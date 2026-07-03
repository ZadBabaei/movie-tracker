"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const SUPPORTED_TYPES = new Set([
    "all",
    "digital",
    "physical",
    "streaming",
]);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = "release-event-window-v3-boxoffice";
const WATCHMODE_BASE_URL = "https://api.watchmode.com/v1";
const WATCHMODE_ENRICH_LIMIT = 24;
const cache = new Map();
const imdbLookupCache = new Map();
const watchmodeDetailsCache = new Map();
const tmdbReleaseDatesCache = new Map();
const tmdbMovieDetailsCache = new Map();
let watchmodeProvidersCache = null;
const formatDate = (date) => date.toISOString().slice(0, 10);
const formatWatchmodeDate = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const normalizeReleaseDateKey = (value) => {
    if (!value)
        return "";
    if (/^\d{8}$/.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    }
    const dateKey = value.slice(0, 10);
    return RELEASE_DATE_PATTERN.test(dateKey) ? dateKey : "";
};
const buildTmdbUrl = (path, params) => {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
};
const buildWatchmodeUrl = (path, params) => {
    const url = new URL(`${WATCHMODE_BASE_URL}${path}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
};
const fetchTmdb = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`TMDb ${response.status}: ${body}`);
    }
    return response.json();
};
const getReleaseWindow = (days) => {
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setUTCDate(maxDate.getUTCDate() + days);
    return {
        todayKey: formatDate(today),
        maxDateKey: formatDate(maxDate),
    };
};
const isWithinReleaseWindow = (releaseDate, days) => {
    if (!releaseDate || !RELEASE_DATE_PATTERN.test(releaseDate))
        return false;
    const parsedDate = new Date(`${releaseDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || formatDate(parsedDate) !== releaseDate) {
        return false;
    }
    const { todayKey, maxDateKey } = getReleaseWindow(days);
    return releaseDate >= todayKey && releaseDate <= maxDateKey;
};
const filterComingSoonReleaseWindow = (movies, days) => movies
    // Coming Soon must only return dated release events from today through the requested future window.
    .filter((movie) => isWithinReleaseWindow(movie.release_date, days))
    .sort((a, b) => {
    const dateCompare = a.release_date.localeCompare(b.release_date);
    if (dateCompare !== 0)
        return dateCompare;
    return Number(b.vote_average || 0) - Number(a.vote_average || 0);
});
const logComingSoonDebug = (details) => {
    if (process.env.NODE_ENV !== "production") {
        console.info("[coming-soon]", details);
    }
};
const fetchWatchmode = async (url, apiKey) => {
    const response = await fetch(url, {
        headers: {
            "X-API-Key": apiKey,
        },
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Watchmode ${response.status}: ${body}`);
    }
    return response.json();
};
const normalizeMovie = (movie, type, releaseDate) => ({
    id: movie.id,
    imdbID: `tmdb-${movie.id}`,
    title: movie.title || movie.name || "Untitled movie",
    overview: movie.overview || "",
    poster_path: movie.poster_path || "",
    backdrop_path: movie.backdrop_path || "",
    release_date: releaseDate || movie.release_date || "",
    vote_average: Number(movie.vote_average || 0),
    type,
    tmdbId: movie.id,
});
const getWatchmodeSourceTypes = (type) => {
    if (type === "streaming")
        return ["sub", "free"];
    if (type === "digital")
        return ["rent", "buy"];
    return ["sub", "rent", "buy", "free"];
};
const getWatchmodeType = (sourceTypes, requestedType) => {
    if (requestedType === "streaming" || requestedType === "digital")
        return requestedType;
    if (sourceTypes.some((sourceType) => sourceType === "sub" || sourceType === "free")) {
        return "streaming";
    }
    if (sourceTypes.some((sourceType) => sourceType === "rent" || sourceType === "buy")) {
        return "digital";
    }
    return "all";
};
const getUniqueStrings = (values) => Array.from(new Set(values.filter((value) => Boolean(value))));
const getPrimaryWebUrl = (sources) => sources.find((source) => typeof source.web_url === "string" && source.web_url.startsWith("http"))
    ?.web_url;
const getWatchmodeProviders = async (apiKey, region) => {
    if (watchmodeProvidersCache && watchmodeProvidersCache.expiresAt > Date.now()) {
        return watchmodeProvidersCache.data;
    }
    const providers = await fetchWatchmode(buildWatchmodeUrl("/sources", { regions: region }), apiKey);
    const providerMap = new Map();
    providers.forEach((provider) => {
        if (provider.id) {
            providerMap.set(provider.id, provider);
        }
    });
    watchmodeProvidersCache = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: providerMap,
    };
    return providerMap;
};
const getWatchmodeDetails = async (apiKey, watchmodeId, region) => {
    const cached = watchmodeDetailsCache.get(watchmodeId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    const details = await fetchWatchmode(buildWatchmodeUrl(`/title/${watchmodeId}/details`, {
        append_to_response: "sources",
        regions: region,
    }), apiKey);
    watchmodeDetailsCache.set(watchmodeId, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: details,
    });
    return details;
};
const normalizeWatchmodeMovie = (base, details, fallbackSources, requestedType, allowedSourceTypes, releaseDate) => {
    const allSources = [...(details?.sources || []), ...fallbackSources];
    const isReleaseEvent = "release_date" in base;
    const filteredSources = allSources.filter((source) => allowedSourceTypes.includes(source.type));
    const sources = isReleaseEvent ? allSources : filteredSources;
    if (sources.length === 0) {
        return null;
    }
    const sourceNames = getUniqueStrings(sources.map((source) => source.name));
    const sourceTypes = getUniqueStrings(sources.map((source) => source.type));
    const watchmodeId = base.id;
    const tmdbId = details?.tmdb_id || ("tmdb_id" in base ? base.tmdb_id || undefined : undefined);
    const imdbId = details?.imdb_id || ("imdb_id" in base ? base.imdb_id || undefined : undefined);
    const title = details?.title || base.title || "Untitled movie";
    return {
        id: tmdbId || watchmodeId,
        imdbID: imdbId || `watchmode-${watchmodeId}`,
        title,
        overview: details?.plot_overview || "",
        poster_path: details?.posterLarge || details?.posterMedium || details?.poster || "",
        backdrop_path: details?.backdrop || "",
        release_date: normalizeReleaseDateKey(releaseDate),
        vote_average: Number(details?.user_rating || 0),
        type: requestedType === "streaming" || isReleaseEvent
            ? "streaming"
            : getWatchmodeType(sourceTypes, requestedType),
        watchmodeId,
        tmdbId,
        imdbId: imdbId || undefined,
        sources,
        sourceNames,
        sourceTypes,
        webUrl: getPrimaryWebUrl(sources),
    };
};
const getTmdbMovieDetails = async (apiKey, tmdbId) => {
    const cached = tmdbMovieDetailsCache.get(tmdbId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    const data = await fetchTmdb(buildTmdbUrl(`/movie/${tmdbId}`, { api_key: apiKey, language: "en-US" })).catch(() => null);
    tmdbMovieDetailsCache.set(tmdbId, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
    });
    return data;
};
const enrichWithBoxOffice = async (movies) => {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey)
        return movies;
    return Promise.all(movies.map(async (movie) => {
        if (!movie.tmdbId)
            return movie;
        const details = await getTmdbMovieDetails(apiKey, movie.tmdbId);
        if (!details)
            return movie;
        return {
            ...movie,
            overview: movie.overview || details.overview || "",
            poster_path: movie.poster_path ||
                (details.poster_path
                    ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
                    : ""),
            backdrop_path: movie.backdrop_path ||
                (details.backdrop_path
                    ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
                    : ""),
            vote_average: Number(details.vote_average || movie.vote_average || 0),
            revenue: Number(details.revenue || 0),
            popularity: Number(details.popularity || 0),
            runtime: Number(details.runtime || 0) || undefined,
            genres: (details.genres || [])
                .map((genre) => genre.name)
                .filter((name) => Boolean(name))
                .slice(0, 3),
        };
    }));
};
const fetchWatchmodeComingSoon = async (apiKey, region, days, type) => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setUTCDate(endDate.getUTCDate() + days);
    const start = formatWatchmodeDate(today);
    const end = formatWatchmodeDate(endDate);
    const allowedSourceTypes = getWatchmodeSourceTypes(type);
    const providers = await getWatchmodeProviders(apiKey, region);
    const releaseDates = await fetchWatchmode(buildWatchmodeUrl("/title-release-dates", {
        start_date: start,
        end_date: end,
        regions: region,
    }), apiKey);
    const movieReleases = releaseDates
        .filter((release) => release.title_type === "movie")
        .filter((release) => release.type === "streaming_movie_release")
        .filter((release) => release.provider_id)
        .slice(0, WATCHMODE_ENRICH_LIMIT);
    const movies = await Promise.all(movieReleases.map(async (release) => {
        const provider = release.provider_id ? providers.get(release.provider_id) : undefined;
        const fallbackSources = [
            {
                source_id: release.provider_id || undefined,
                name: provider?.name,
                type: provider?.type === "purchase" ? "buy" : provider?.type,
                region,
            },
        ];
        const details = await getWatchmodeDetails(apiKey, release.id, region).catch(() => null);
        return normalizeWatchmodeMovie(release, details, fallbackSources, type, allowedSourceTypes, release.release_date);
    }));
    const normalizedMovies = movies.filter((movie) => Boolean(movie));
    const enrichedMovies = await enrichWithBoxOffice(normalizedMovies);
    const filteredMovies = filterComingSoonReleaseWindow(enrichedMovies, days);
    logComingSoonDebug({
        type,
        region,
        source: "watchmode:title-release-dates",
        sourceCount: releaseDates.length,
        normalizedCount: normalizedMovies.length,
        filteredCount: filteredMovies.length,
    });
    // /list-titles returns currently available/popular catalog items, not strict upcoming
    // availability events, so it is intentionally not used as a Coming Soon fallback.
    return filteredMovies;
};
const getStreamingProviderIds = async (apiKey, region) => {
    const url = buildTmdbUrl("/watch/providers/movie", {
        api_key: apiKey,
        watch_region: region,
        language: "en-US",
    });
    const data = await fetchTmdb(url);
    return (data.results || [])
        .map((provider) => provider.provider_id)
        .filter(Boolean)
        .slice(0, 12);
};
const getTmdbReleaseDates = async (apiKey, movieId) => {
    const cached = tmdbReleaseDatesCache.get(movieId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    const data = await fetchTmdb(buildTmdbUrl(`/movie/${movieId}/release_dates`, { api_key: apiKey }));
    tmdbReleaseDatesCache.set(movieId, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
    });
    return data;
};
const getTmdbReleaseEventDate = async (apiKey, movieId, region, releaseType, days) => {
    const data = await getTmdbReleaseDates(apiKey, movieId);
    const regionRelease = (data.results || []).find((release) => release.iso_3166_1?.toUpperCase() === region);
    const eventDates = (regionRelease?.release_dates || [])
        .filter((release) => release.type === releaseType)
        .map((release) => normalizeReleaseDateKey(release.release_date))
        .filter((releaseDate) => isWithinReleaseWindow(releaseDate, days))
        .sort();
    return eventDates[0] || "";
};
const discoverMovies = async (apiKey, region, days, type) => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setUTCDate(endDate.getUTCDate() + days);
    const start = formatDate(today);
    const end = formatDate(endDate);
    const baseParams = {
        api_key: apiKey,
        language: "en-US",
        region,
        include_adult: "false",
        sort_by: "popularity.desc",
        "release_date.gte": start,
        "release_date.lte": end,
    };
    if (type === "digital") {
        baseParams.with_release_type = 4;
    }
    if (type === "physical") {
        baseParams.with_release_type = 5;
    }
    if (type !== "digital" && type !== "physical") {
        baseParams["primary_release_date.gte"] = start;
        baseParams["primary_release_date.lte"] = end;
    }
    if (type === "streaming") {
        const providerIds = await getStreamingProviderIds(apiKey, region);
        baseParams.watch_region = region;
        baseParams.with_watch_monetization_types = "flatrate";
        if (providerIds.length > 0) {
            baseParams.with_watch_providers = providerIds.join("|");
        }
        // TMDb watch-provider data is useful for streaming discovery, but it does
        // not reliably expose exact future streaming release dates for every movie.
    }
    const pages = [1, 2];
    const responses = await Promise.all(pages.map((page) => fetchTmdb(buildTmdbUrl("/discover/movie", { ...baseParams, page }))));
    const deduped = new Map();
    const candidates = responses
        .flatMap((response) => response.results || [])
        .filter((movie) => movie.id)
        .filter((movie) => {
        if (type === "digital" || type === "physical")
            return true;
        return movie.release_date && movie.release_date >= start && movie.release_date <= end;
    });
    const releaseType = type === "digital" ? 4 : type === "physical" ? 5 : undefined;
    const moviesWithEventDates = await Promise.all(candidates.map(async (movie) => {
        const eventDate = releaseType
            ? await getTmdbReleaseEventDate(apiKey, movie.id, region, releaseType, days).catch(() => "")
            : movie.release_date || "";
        return { movie, eventDate };
    }));
    moviesWithEventDates
        .filter(({ eventDate }) => isWithinReleaseWindow(eventDate, days))
        .forEach(({ movie, eventDate }) => {
        if (!deduped.has(movie.id)) {
            deduped.set(movie.id, normalizeMovie(movie, type, eventDate));
        }
    });
    const enrichedMovies = await enrichWithBoxOffice(Array.from(deduped.values()));
    const filteredMovies = filterComingSoonReleaseWindow(enrichedMovies, days);
    logComingSoonDebug({
        type,
        region,
        source: "tmdb:discover",
        sourceCount: candidates.length,
        normalizedCount: deduped.size,
        filteredCount: filteredMovies.length,
    });
    return filteredMovies;
};
const getDedupeKey = (movie) => {
    if (movie.tmdbId)
        return `tmdb:${movie.tmdbId}`;
    if (movie.imdbId)
        return `imdb:${movie.imdbId}`;
    if (movie.watchmodeId)
        return `watchmode:${movie.watchmodeId}`;
    return `title:${movie.title.toLowerCase()}:${movie.release_date}`;
};
const combineComingSoonMovies = (groups, days) => {
    const deduped = new Map();
    groups.flat().forEach((movie) => {
        const key = getDedupeKey(movie);
        const existing = deduped.get(key);
        if (!existing || Number(movie.vote_average || 0) > Number(existing.vote_average || 0)) {
            deduped.set(key, movie);
        }
    });
    return filterComingSoonReleaseWindow(Array.from(deduped.values()), days);
};
router.get("/:tmdbId/imdb", async (req, res) => {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        res.status(500).json({ msg: "TMDb API key is not configured on the server." });
        return;
    }
    const tmdbId = Number(req.params.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
        res.status(400).json({ msg: "A valid TMDb movie ID is required." });
        return;
    }
    const cached = imdbLookupCache.get(tmdbId);
    if (cached && cached.expiresAt > Date.now()) {
        if (cached.data) {
            res.json(cached.data);
            return;
        }
        res.status(404).json({ msg: "IMDb page is not available for this movie yet." });
        return;
    }
    try {
        const data = await fetchTmdb(buildTmdbUrl(`/movie/${tmdbId}/external_ids`, { api_key: apiKey }));
        const imdbId = data.imdb_id || "";
        const imdbLookup = imdbId.startsWith("tt")
            ? {
                imdbId,
                imdbUrl: `https://www.imdb.com/title/${imdbId}/`,
            }
            : null;
        imdbLookupCache.set(tmdbId, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            data: imdbLookup,
        });
        if (!imdbLookup) {
            res.status(404).json({ msg: "IMDb page is not available for this movie yet." });
            return;
        }
        res.json(imdbLookup);
    }
    catch (error) {
        console.error("Failed to fetch IMDb ID from TMDb:", error);
        res.status(502).json({
            msg: "Failed to fetch IMDb ID from TMDb.",
        });
    }
});
router.get("/", async (req, res) => {
    const region = String(req.query.region || process.env.WATCHMODE_REGION || "CA")
        .trim()
        .toUpperCase() || "CA";
    const parsedDays = Number(req.query.days || 30);
    const days = Number.isFinite(parsedDays)
        ? Math.min(Math.max(Math.round(parsedDays), 1), 90)
        : 30;
    const requestedType = String(req.query.type || "all").toLowerCase();
    const type = SUPPORTED_TYPES.has(requestedType) ? requestedType : "all";
    const cacheKey = `${CACHE_VERSION}:${region}:${days}:${type}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
    }
    try {
        if (type === "digital" || type === "physical") {
            const tmdbApiKey = process.env.TMDB_API_KEY;
            if (!tmdbApiKey) {
                res.status(500).json({ msg: "TMDb API key is not configured on the server." });
                return;
            }
            const movies = filterComingSoonReleaseWindow(await discoverMovies(tmdbApiKey, region, days, type), days);
            cache.set(cacheKey, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                data: movies,
            });
            res.json(movies);
            return;
        }
        if (type === "streaming") {
            const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
            const tmdbApiKey = process.env.TMDB_API_KEY;
            if (!watchmodeApiKey && !tmdbApiKey) {
                res.status(500).json({ msg: "Watchmode API key is not configured on the server." });
                return;
            }
            let streamingMovies = [];
            if (watchmodeApiKey) {
                streamingMovies = await fetchWatchmodeComingSoon(watchmodeApiKey, region, days, type).catch((error) => {
                    console.warn("Watchmode streaming release events unavailable:", error);
                    return [];
                });
            }
            // Watchmode's release-dates endpoint requires a paid plan; TMDB digital
            // release events are the closest free equivalent for home availability.
            if (streamingMovies.length === 0 && tmdbApiKey) {
                streamingMovies = await discoverMovies(tmdbApiKey, region, days, "digital");
            }
            const movies = filterComingSoonReleaseWindow(streamingMovies, days);
            cache.set(cacheKey, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                data: movies,
            });
            res.json(movies);
            return;
        }
        const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
        if (!watchmodeApiKey) {
            res.status(500).json({ msg: "Watchmode API key is not configured on the server." });
            return;
        }
        const tmdbApiKey = process.env.TMDB_API_KEY;
        const digitalMovies = tmdbApiKey
            ? await discoverMovies(tmdbApiKey, region, days, "digital")
            : [];
        const physicalMovies = tmdbApiKey
            ? await discoverMovies(tmdbApiKey, region, days, "physical")
            : [];
        const streamingMovies = await fetchWatchmodeComingSoon(watchmodeApiKey, region, days, "streaming").catch((error) => {
            console.warn("Watchmode streaming release events unavailable for combined results:", error);
            return [];
        });
        const movies = combineComingSoonMovies([digitalMovies, physicalMovies, streamingMovies], days);
        logComingSoonDebug({
            type,
            region,
            source: "combined",
            sourceCount: digitalMovies.length + physicalMovies.length + streamingMovies.length,
            normalizedCount: movies.length,
            filteredCount: movies.length,
        });
        cache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            data: movies,
        });
        res.json(movies);
    }
    catch (error) {
        console.error("Failed to fetch coming soon movies:", error);
        res.status(502).json({
            msg: "Failed to fetch coming soon movies.",
        });
    }
});
exports.default = router;
