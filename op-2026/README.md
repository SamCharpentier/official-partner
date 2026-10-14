# Official Partner 2026: site JS

`op-site.js` is the readable source; `op-site.min.js` is what Webflow loads.

Loaded at the end of the site footer in Webflow, after jQuery, webflow.js, GSAP (Flip, ScrollTrigger, SplitText, CustomEase, from Webflow's GSAP settings), Lenis 1.1.20 and Barba 2.9.0:

```html
<script src="https://cdn.jsdelivr.net/gh/SamCharpentier/official-partner@op-2026-v1.0.0/op-2026/op-site.min.js"></script>
```

One tag per release (`op-2026-v1.0.1`, ...). To roll back, put the previous tag back in the footer and publish.

The file expects:

- a hidden page at `/archive-panels` holding the case-study list (`.cs-coll-item[data-work]`), or the list left on the Archive page (both work);
- the head snippet that hides `.loader-1` once the intro has played this session.

Check before each release: `node --check op-site.js`, then the same on the minified file.
