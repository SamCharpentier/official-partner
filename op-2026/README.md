# Official Partner 2026: site JS

`op-site.js` is the readable source; `op-site.min.js` is what Webflow loads.

Loaded at the end of the site footer in Webflow, after jQuery, webflow.js, GSAP (Flip, ScrollTrigger, SplitText, CustomEase, from Webflow's GSAP settings), Barba 2.10.3 and Lenis 1.3.17. The exact head and footer code for Webflow is in `webflow/` (`head.html`, `footer.html`), with the two CSS embeds of the Custom Code component in `webflow/embeds/` (house CSS and the Lumos base); the code they replaced is in `webflow/backup-2026-10-14/`.

Current release (v1.1.0), pinned to its commit:

```html
<script src="https://cdn.jsdelivr.net/gh/SamCharpentier/official-partner@f275e014b3dad6e19a29e03797e5f1bfeea6fefd/op-2026/op-site.min.js"></script>
```

Previous release (v1.0.0, to roll back): `@5a77955c4cda0ba5c8b96c6e630f90437a04ffd7`.

A commit URL never changes, so it is safe in production. For readable release names, tag the commit (`git tag op-2026-v1.0.0 5a77955 && git push origin op-2026-v1.0.0`, or a release on GitHub) and use `@op-2026-v1.0.0` in place of the hash. One tag per release after that (`op-2026-v1.0.1`, ...). To roll back, put the previous hash or tag back in the footer and publish.

The file expects:

- a hidden page at `/archive-panels` holding the case-study list (`.cs-coll-item[data-work]`), or the list left on the Archive page (both work);
- the head snippet in `webflow/head.html` that hides `.loader-1` once the intro has played this session;
- since v1.1.0, the house CSS embed (Custom Code component, `page_code_custom-2`) with the loader rules (`.load-img-wrap` absolute, 81em, scale 0) and the `.skip-link` rules. Without the loader rules the intro falls back to the v1.0.0 tweens, which shift the page;
- a `<main id="main" tabindex="-1">` on each page (the focus target after a page change and for the skip link, the first element of the Nav component).

Known limit: the Archive list shows up to 100 projects (Webflow's list limit). Finsweet CMS Load used to fetch the next page; the site JS does not. Past 100 projects, add that to the JS or split the list.

Build: `terser op-site.js -c passes=2 -m -o op-site.min.js` (terser 5). Check before each release: `node --check op-site.js`, then the same on the minified file.
