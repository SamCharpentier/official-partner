# Official Partner 2026: site JS

`op-site.js` is the readable source; `op-site.min.js` is what Webflow loads.

Loaded at the end of the site footer in Webflow, after jQuery, webflow.js, GSAP (Flip, ScrollTrigger, SplitText, CustomEase, from Webflow's GSAP settings), Lenis 1.1.20 and Barba 2.9.0. The exact head and footer code for Webflow is in `webflow/` (`head.html`, `footer.html`); the code they replaced is in `webflow/backup-2026-10-14/`.

Current release (v1.0.0), pinned to its commit:

```html
<script src="https://cdn.jsdelivr.net/gh/SamCharpentier/official-partner@5a77955c4cda0ba5c8b96c6e630f90437a04ffd7/op-2026/op-site.min.js"></script>
```

A commit URL never changes, so it is safe in production. For readable release names, tag the commit (`git tag op-2026-v1.0.0 5a77955 && git push origin op-2026-v1.0.0`, or a release on GitHub) and use `@op-2026-v1.0.0` in place of the hash. One tag per release after that (`op-2026-v1.0.1`, ...). To roll back, put the previous hash or tag back in the footer and publish.

The file expects:

- a hidden page at `/archive-panels` holding the case-study list (`.cs-coll-item[data-work]`), or the list left on the Archive page (both work);
- the head snippet in `webflow/head.html` that hides `.loader-1` once the intro has played this session.

Known limit: the Archive list shows up to 100 projects (Webflow's list limit). Finsweet CMS Load used to fetch the next page; the site JS does not. Past 100 projects, add that to the JS or split the list.

Check before each release: `node --check op-site.js`, then the same on the minified file.
