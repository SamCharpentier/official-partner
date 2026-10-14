# SEO and AI-readability files for officialpartner.work

- `llms.txt`: upload in Webflow, Site settings > SEO > LLMs.txt (served at /llms.txt on the custom domain after the next publish; Webflow does not serve it on webflow.io). It is a snapshot of the 81 projects shown in the Archive on 2026-10-14: regenerate it when projects are added.
- `robots.txt`: suggested content for Site settings > SEO > Robots.txt. It allows every crawler and points to the sitemap. Leave `/archive-panels` crawlable: its noindex tag only works if crawlers can read the page.
- `jsonld-pages.json`: the JSON-LD set on Home, About, Archives and Contact (page settings > Schema markup), keyed by page ID.
