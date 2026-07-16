const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const TWITTER_HOSTS = new Set(["twitter.com", "www.twitter.com", "x.com", "www.x.com"]);
const TWEET_PATH_PATTERN = /^\/[A-Za-z0-9_]{1,32}\/status\/[0-9]+\/?$/;

function isSafeHttpsUrl(url) {
  return url.protocol === "https:" && !url.username && !url.password && !url.port;
}

function normalizeVideoId(candidate) {
  return VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Accepts a plain YouTube ID or an HTTPS watch/share/embed URL from an exact
 * YouTube hostname. Returns only the injection-safe video ID alphabet.
 *
 * @param {unknown} input
 * @returns {string | null}
 */
export function getYouTubeVideoId(input) {
  if (typeof input !== "string") return null;

  const value = input.trim();
  const plainId = normalizeVideoId(value);
  if (plainId) return plainId;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!isSafeHttpsUrl(url)) return null;

  if (YOUTUBE_SHORT_HOSTS.has(url.hostname)) {
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length === 1 ? normalizeVideoId(segments[0]) : null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

  if (url.pathname === "/watch") {
    return normalizeVideoId(url.searchParams.get("v") ?? "");
  }

  const embedMatch = url.pathname.match(/^\/embed\/([^/]+)\/?$/);
  return embedMatch ? normalizeVideoId(embedMatch[1]) : null;
}

/**
 * Accepts only canonical HTTPS tweet/status URLs from exact X/Twitter hosts.
 * Query parameters and fragments are discarded before rendering.
 *
 * @param {unknown} input
 * @returns {string | null}
 */
export function getSafeTweetUrl(input) {
  if (typeof input !== "string") return null;

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (!isSafeHttpsUrl(url) || !TWITTER_HOSTS.has(url.hostname)) return null;
  if (!TWEET_PATH_PATTERN.test(url.pathname)) return null;

  url.search = "";
  url.hash = "";
  return url.href;
}
