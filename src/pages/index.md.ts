import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const markdownContent = `# Manoj Mahapatra (@mahapmanoj)

iOS Engineer. Swift, Bazel, Monorepos. Writing about iOS development and build systems.

## Navigation

- [About](/about.md)
- [Recent Posts](/posts.md)
- [Archives](/archives.md)
- [RSS Feed](/rss.xml)

## Links

- Twitter: [@mahapmanoj](https://twitter.com/mahapmanoj)
- GitHub: [@manojmahapatra](https://github.com/manojmahapatra)

---

*This is the markdown-only version. Visit [manojmahapatra.github.io](https://manojmahapatra.github.io) for the full experience.*`;

  return new Response(markdownContent, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
