import { getSafeTweetUrl, getYouTubeVideoId } from "@/utils/embedSecurity.mjs";

const SHORTCODE_PATTERN = /^\{%\s+(twitter|youtube)\s+([^\s]+)\s+%\}$/;

function createYouTubeEmbed(videoId: string) {
  const container = document.createElement("div");
  container.className = "youtube-embed-container";

  const iframe = document.createElement("iframe");
  iframe.width = "560";
  iframe.height = "315";
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  iframe.title = "YouTube video player";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.sandbox.add("allow-scripts", "allow-same-origin", "allow-presentation", "allow-popups");

  container.appendChild(iframe);
  return container;
}

function createTweetLink(url: string) {
  const container = document.createElement("div");
  container.className = "twitter-tweet-placeholder";

  const blockquote = document.createElement("blockquote");
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View this post on X";

  blockquote.appendChild(link);
  container.appendChild(blockquote);
  return container;
}

export function processEmbeds(root: ParentNode = document) {
  const article = root.querySelector("#article, .mdx-content");
  if (!article) return;

  for (const paragraph of article.querySelectorAll("p")) {
    const match = paragraph.textContent?.trim().match(SHORTCODE_PATTERN);
    if (!match) continue;

    const [, provider, input] = match;
    if (provider === "youtube") {
      const videoId = getYouTubeVideoId(input);
      if (videoId) paragraph.replaceWith(createYouTubeEmbed(videoId));
      continue;
    }

    const tweetUrl = getSafeTweetUrl(input);
    if (tweetUrl) paragraph.replaceWith(createTweetLink(tweetUrl));
  }
}
