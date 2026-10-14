/* =========================================================================
   OFFICIAL PARTNER 2026 · SITE JS
   jQuery + GSAP (ScrollTrigger, SplitText, CustomEase, Flip) + Lenis + Barba
   One file. Lifecycle: once() for what persists, everyPage() for each page.

   Loaded before this file, in this order: jQuery and webflow.js (Webflow),
   GSAP 3.15 with Flip, ScrollTrigger, SplitText and CustomEase (Webflow's
   GSAP settings), Lenis 1.1.20, Barba 2.9.0.

   0.  STATE        scroll locks, current page, open modal
   1.  UTILS        safely(), page registry, storage, scroll helpers, images
   2.  EASES        the three intro curves, named once
   3.  LENIS        created once, driven by the GSAP ticker, locked without stop()
   4.  HISTORY      Back and Forward for the contact popup and the case studies
   5.  CONTACT      popup (persistent, outside the Barba container)
   6.  DRAWING      canvases, mirrored strokes, Drawings page
   7.  INTRO        home loader, once per session, desktop only
   8.  NAV SCROLL   progressive blur and nav on scroll
   9.  SHOWCASE     home tiles hover cycle
   10. DRAWERS      accordions
   11. QUOTES       big quotes rotating on scroll
   12. ARCHIVE      list, hover previews, filter and sort, case-study panel
   13. PREFETCH     next page HTML and its first images, on intent
   14. TRANSITIONS  colour cross-fade between pages, arrival animations
   15. BARBA        hooks and init
   16. BOOT         editor bail-out, once(), everyPage(), initBarba()

   once():      initLenis, initHistory, initContact, initDrawingOnce,
                initFormGuard, initPrefetch, initIntro (first load only)
   everyPage(): initNavScroll, initShowcase, initDrawers, initQuotes,
                initDrawAreas, initDrawingsPage, initArchive, markContactLinks,
                playVideos (after a navigation)
   ========================================================================= */

(function () {
  'use strict';

  if (!window.gsap || !window.jQuery) return;

  const $ = window.jQuery;
  const html = document.documentElement;

  /* 0. STATE ---------------------------------------------------------------- */

  const VERSION = '1.0.0';

  const STATE = {
    lenis: null,
    intro: null,            // the home intro timeline while it plays
    locks: new Set(),       // why the scroll is locked: 'intro', 'transition', 'project', 'contact'
    page: null,             // { container, ctx, cleanups }
    path: location.pathname,
    modal: null,            // { name, close(options) } while the contact popup or a case study is open
    archive: null,          // the archive controller of the current page, if any
    navigated: false,       // true after the first Barba navigation
  };

  /* 1. UTILS ---------------------------------------------------------------- */

  const isStaging = /\.webflow\.io$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const log = (...args) => { if (isStaging) console.log('[op]', ...args); };
  const warn = (...args) => console.warn('[op]', ...args);
  const media = (query) => window.matchMedia(query);
  const reducedMotion = media('(prefers-reduced-motion: reduce)');
  const isDesktop = () => media('(min-width: 992px)').matches;
  const isNavLogoBreakpoint = () => media('(min-width: 769px)').matches;
  const isSafari = () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isFrench = () => (html.getAttribute('lang') || '').toLowerCase().startsWith('fr');
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeAttr = (value) => (window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"'));

  function inEditor() {
    try {
      return !!(window.Webflow && Webflow.env && Webflow.env('editor') !== undefined);
    } catch (e) {
      return false;
    }
  }

  // One feature throwing must never take the others down (Barba also swallows hook errors).
  function safely(name, fn) {
    try {
      return fn();
    } catch (e) {
      console.error('[op] ' + name + ' failed', e);
      return undefined;
    }
  }

  // Storage can be blocked (private mode, sandboxed frame): a failed read is "nothing saved".
  const storage = {
    get(area, key) { try { return window[area].getItem(key); } catch (e) { return null; } },
    set(area, key, value) { try { window[area].setItem(key, value); } catch (e) { /* blocked */ } },
  };

  function idle(fn, timeout = 2000) {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout });
    else setTimeout(fn, 300);
  }

  function setCursor(value) {
    html.style.cursor = value || '';
  }

  // GSAP warns about empty targets: these skip a tween when nothing matches.
  const present = (targets) => !!targets && (typeof targets.length !== 'number' || targets.length > 0);
  const to = (targets, vars) => (present(targets) ? gsap.to(targets, vars) : null);
  const from = (targets, vars) => (present(targets) ? gsap.from(targets, vars) : null);
  const fromTo = (targets, start, end) => (present(targets) ? gsap.fromTo(targets, start, end) : null);
  const set = (targets, vars) => (present(targets) ? gsap.set(targets, vars) : null);

  // Page registry: everything a page creates is torn down when it leaves.
  // GSAP tweens, timelines, ScrollTriggers and SplitTexts made inside inPage() are
  // recorded in the page's gsap.context; listeners and timers go through onCleanup().
  function startPage(container) {
    STATE.page = { container, cleanups: [], ctx: gsap.context(() => {}) };
    return STATE.page;
  }

  function onCleanup(fn, page = STATE.page) {
    if (page) page.cleanups.push(fn);
  }

  function inPage(fn, page = STATE.page) {
    return page ? page.ctx.add(fn) : fn();
  }

  function listen(target, type, fn, options, page = STATE.page) {
    target.addEventListener(type, fn, options);
    onCleanup(() => target.removeEventListener(type, fn, options), page);
  }

  function endPage(page) {
    if (!page || page.ended) return;
    page.ended = true;
    page.cleanups.splice(0).reverse().forEach((fn) => safely('cleanup', fn));
    page.ctx.kill();
  }

  // Scroll lock without lenis.stop(): stop() toggles overflow on <html> and the page
  // reflows by the scrollbar width on Windows. Wheel and touch are held in Lenis's
  // virtualScroll, the keyboard below. Without Lenis (Safari, reduced motion) the
  // root's overflow does it, with the scrollbar gutter kept so nothing moves.
  const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

  function lockScroll(reason) {
    const wasLocked = STATE.locks.size > 0;
    STATE.locks.add(reason);
    if (wasLocked) return;
    if (STATE.lenis) {
      STATE.lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    } else {
      if (window.innerWidth > html.clientWidth) html.style.scrollbarGutter = 'stable';
      html.style.overflow = 'hidden';
    }
  }

  function unlockScroll(reason) {
    if (!STATE.locks.delete(reason) || STATE.locks.size) return;
    if (!STATE.lenis) {
      html.style.overflow = '';
      html.style.scrollbarGutter = '';
    }
  }

  function scrollToY(y) {
    try {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    } catch (e) {
      window.scrollTo(0, y);
    }
    if (STATE.lenis) {
      STATE.lenis.resize();
      STATE.lenis.scrollTo(y, { immediate: true, force: true });
    }
  }

  // Recompute every trigger with the page at y and leave it there.
  function refreshScrollTriggersAt(y) {
    ScrollTrigger.refresh();
    scrollToY(y);
    ScrollTrigger.update();
  }

  // Ask the browser for an image now (a hidden or lazy one would wait), same candidate as the page will use.
  function warmImage(img) {
    if (!img || (img.complete && img.naturalWidth)) return;
    const src = img.getAttribute('src');
    if (!src || src.indexOf('placeholder') !== -1) return;
    const warm = new Image();
    warm.decoding = 'async';
    if (img.sizes) warm.sizes = img.sizes;
    if (img.srcset) warm.srcset = img.srcset;
    warm.src = src;
  }

  // Resolve once the image can be painted, or after `max` ms, whichever comes first.
  function imageReady(img, max = 250) {
    if (!img || (img.complete && img.naturalWidth)) return Promise.resolve();
    const wait = img.decode ? img.decode().catch(() => {}) : new Promise((done) => img.addEventListener('load', done, { once: true }));
    return Promise.race([wait, new Promise((done) => setTimeout(done, max))]);
  }

  /* 2. EASES ---------------------------------------------------------------- */

  function initEases() {
    if (!window.CustomEase) return;
    CustomEase.create('opOvershoot', 'M0,0 C0.288,0 -0.09,1.142 1,1 ');  // intro: frame opening, slight overshoot
    CustomEase.create('opSnap', 'M0,0 C0.346,0 -0.202,1 1,1 ');          // intro: quick snap, no overshoot
    CustomEase.create('opPop', 'M0,0 C0.674,0 0.15,1.144 1,1 ');         // intro: late start, overshoot
  }

  /* 3. LENIS ---------------------------------------------------------------- */

  // Native scroll on Safari and iOS (as before) and with reduced motion.
  function initLenis() {
    if (STATE.lenis || typeof window.Lenis !== 'function' || isSafari() || reducedMotion.matches) return;
    const lenis = new Lenis({
      virtualScroll: (data) => {
        if (!STATE.locks.size) return true;
        if (data.event.cancelable) data.event.preventDefault();
        return false;
      },
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    STATE.lenis = lenis;
  }

  function initScrollKeys() {
    document.addEventListener('keydown', (e) => {
      if (!STATE.locks.size || !SCROLL_KEYS.has(e.key)) return;
      if (e.target.closest && e.target.closest('input, textarea, select, button, a, [contenteditable]')) return;
      e.preventDefault();
    });
  }

  /* 4. HISTORY -------------------------------------------------------------- */

  // Opening the contact popup or a case study adds one history entry; Back closes it,
  // Forward reopens it. Registered before barba.init so it runs first: when only the
  // query changes, Barba has nothing to do and never hears about it.
  function modalState(name, extra) {
    return Object.assign({}, history.state || {}, { opModal: name }, extra || {});
  }

  function initHistory() {
    window.addEventListener('popstate', (e) => {
      if (window.barba && barba.transitions && barba.transitions.isRunning) return;
      const state = e.state || {};
      const samePath = location.pathname === STATE.path;

      if (STATE.modal && state.opModal !== STATE.modal.name) {
        STATE.modal.close({ fromHistory: true, instant: !samePath });
        if (samePath) e.stopImmediatePropagation();
        return;
      }
      if (samePath && state.opModal && !STATE.modal) {
        e.stopImmediatePropagation();
        if (state.opModal === 'contact') Contact.open({ fromHistory: true });
        else if (state.opModal === 'project' && STATE.archive) STATE.archive.openSlug(state.slug, { fromHistory: true });
        return;
      }
      if (samePath) e.stopImmediatePropagation();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && STATE.modal) STATE.modal.close({});
    });
  }

  /* 5. CONTACT -------------------------------------------------------------- */

  const CONTACT_LINKS = 'a[href="/contact"], a[href="/fr/contact"]';
  const isContactLink = (el) => !!(el && el.matches && el.matches(CONTACT_LINKS));

  const Contact = {
    isOpen: false,
    pushed: false,
    opener: null,
    popup() {
      return qs('.contact-popup');
    },
    open({ fromHistory = false } = {}) {
      const popup = this.popup();
      if (!popup || this.isOpen) return;
      if (STATE.modal) STATE.modal.close({ instant: true });
      this.isOpen = true;
      this.opener = document.activeElement;
      STATE.modal = { name: 'contact', close: (options) => Contact.close(options) };
      $(popup).find('.contact').addClass('is-open');
      if (!fromHistory) history.pushState(modalState('contact'), '', location.href);
      this.pushed = true;   // opened here, or again with Forward: Back closes it
      lockScroll('contact');
      set([popup, ...qsa('.close-contact, .copy-clip', popup)], { opacity: 1, pointerEvents: 'auto' });
      set(qsa('.contact-link', popup), { pointerEvents: 'auto' });
      fromTo(qsa('.contact-popup-bk, .footer-draw', popup), { opacity: 0 }, { opacity: 1, duration: 0.25, delay: 0.1, ease: 'power2.out' });
      fromTo(qsa('.contact-txt, .close-contact-wrap, .copy-clip-wrap', popup), { opacity: 0 }, { opacity: 1, duration: 0.1, delay: 0.15 });
      fromTo(qsa('.contact-txt', popup), { y: '-4rem', rotate: '10deg' }, { y: 0, rotate: 0, ease: 'elastic.out(1,0.8)', duration: 0.9, delay: 0.15 });
      safely('popup drawing', () => qsa('.footer-draw', popup).forEach((area) => Draw.init(area, null)));
      const closeButton = qs('.close-contact', popup);
      if (closeButton) closeButton.focus({ preventScroll: true });
    },
    close({ fromHistory = false, instant = false } = {}) {
      const popup = this.popup();
      if (!popup || !this.isOpen) return;
      this.isOpen = false;
      if (STATE.modal && STATE.modal.name === 'contact') STATE.modal = null;
      $(popup).find('.contact').removeClass('is-open');
      if (!fromHistory && this.pushed && history.state && history.state.opModal === 'contact') history.back();
      this.pushed = false;
      const fading = qsa('.contact-popup-bk, .contact-txt, .footer-draw, .close-contact-wrap, .copy-clip-wrap', popup);
      const finish = () => {
        gsap.set(popup, { opacity: 0, pointerEvents: 'none' });
        set(qsa('.contact-link, .close-contact, .copy-clip', popup), { pointerEvents: 'none', overwrite: true });
      };
      if (instant || !fading.length) {
        if (fading.length) {
          gsap.killTweensOf(fading);
          gsap.set(fading, { opacity: 0 });
        }
        finish();
      } else {
        gsap.to(fading, { opacity: 0, duration: 0.3, ease: 'power2.inOut', onComplete: finish });
        if (STATE.page) gsap.to(STATE.page.container, { opacity: 1, duration: 0.35, ease: 'power2.inOut' });
      }
      unlockScroll('contact');
      if (this.opener && this.opener.isConnected && !instant) this.opener.focus({ preventScroll: true });
      this.opener = null;
    },
  };

  function initContact() {
    // Capture phase: runs before Barba's link handler, which never sees these clicks.
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a[href]');
      if (!isContactLink(link) || !Contact.popup()) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      Contact.open();
    }, true);

    $(document).on('click', '.close-contact', () => Contact.close());

    // Copy the email; the button's own label comes back after 3 s.
    let restore = null;
    $(document).on('click', '.copy-clip', function () {
      const email = $(this).closest('.about-contact').find('.contact-link').text().trim();
      const label = $(this).find('div');
      if (!label.data('opLabel')) label.data('opLabel', label.text());
      if (navigator.clipboard) navigator.clipboard.writeText(email).catch(() => {});
      gsap.fromTo(label, { yPercent: 30, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, onStart: () => label.text(isFrench() ? 'Courriel copié' : 'Email copied!') });
      if (restore) restore.kill();
      restore = gsap.delayedCall(3, () => {
        gsap.fromTo(label, { yPercent: 30, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, onStart: () => label.text(label.data('opLabel')) });
      });
    });

    const popup = Contact.popup();
    if (popup) labelButtons(popup);
  }

  // Contact links in a new page skip Barba (the click handler above opens the popup).
  function markContactLinks(container) {
    qsa(CONTACT_LINKS, container).forEach((link) => link.setAttribute('data-barba-prevent', ''));
  }

  // Icon-only buttons get a name screen readers can announce.
  function labelButtons(root) {
    const fr = isFrench();
    qsa('.close-contact', root).forEach((b) => b.hasAttribute('aria-label') || b.setAttribute('aria-label', fr ? 'Fermer' : 'Close'));
    qsa('.close-archive', root).forEach((b) => b.hasAttribute('aria-label') || b.setAttribute('aria-label', fr ? 'Fermer le projet' : 'Close project'));
  }

  // Enter in a text field never submits a form (the archive search, the drawing form).
  function initFormGuard() {
    document.addEventListener('keypress', (e) => {
      if (e.key !== 'Enter') return;
      const field = e.target;
      if (!field.closest || !field.closest('form')) return;
      if (!field.matches('input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])')) return;
      e.preventDefault();
    });
  }

  /* 6. DRAWING -------------------------------------------------------------- */

  // Strokes drawn in one .footer-draw are mirrored in every other one (footer and popup)
  // and kept across pages. Areas are hidden in Webflow today (display: none): an area
  // only gets its canvas once it is actually displayed.
  const Draw = {
    all: [],
    user: [],
    current: [],
    areas: new Map(),   // element -> { canvas, ctx, baseW, baseH }

    init(el, page) {
      if (this.areas.has(el)) return;
      if (getComputedStyle(el).display === 'none' || !el.clientWidth || !el.clientHeight) return;
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      const area = { el, canvas, ctx: canvas.getContext('2d'), baseW: 0, baseH: 0 };
      this.size(area);
      area.baseW = canvas.width;
      area.baseH = canvas.height;
      this.areas.set(el, area);
      this.redraw(area);

      let drawing = false;
      let last = [0, 0];
      const links = () => $(el).closest('[draw]').find('.drew-form, .locale-wrapper, .footer-link, .footer-link.w-inline-block, .link-hover, .contact-link');
      const onLeave = () => { drawing = false; };
      const onDown = (e) => {
        drawing = true;
        links().css('pointer-events', 'none');
        this.current = [];
        last = this.toCanvas(area, e.clientX, e.clientY);
        this.current.push(last);
      };
      const onUp = () => {
        drawing = false;
        links().css('pointer-events', 'auto');
        if (this.current.length) {
          this.user.push(this.current);
          this.all.push(this.current);
        }
      };
      const onMove = (e) => {
        if (!drawing) return;
        const point = this.toCanvas(area, e.clientX, e.clientY);
        this.areas.forEach((other) => {
          if (other.canvas.isConnected) this.segment(other.ctx, last[0], last[1], point[0], point[1], area.baseW, area.baseH);
        });
        this.current.push(point);
        last = point;
      };
      const onResize = () => { this.size(area); this.redraw(area); };
      el.addEventListener('mouseleave', onLeave);
      el.addEventListener('mousedown', onDown);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('mousemove', onMove);
      window.addEventListener('resize', onResize);
      const remove = () => {
        el.removeEventListener('mouseleave', onLeave);
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('mouseup', onUp);
        el.removeEventListener('mousemove', onMove);
        window.removeEventListener('resize', onResize);
        canvas.remove();
        this.areas.delete(el);
      };
      if (page) onCleanup(remove, page);
    },

    size(area) {
      area.canvas.width = area.el.clientWidth;
      area.canvas.height = area.el.clientHeight;
      area.ctx.lineCap = 'round';
      area.ctx.lineJoin = 'round';
      area.ctx.lineWidth = 1;
    },

    redraw(area) {
      area.ctx.clearRect(0, 0, area.canvas.width, area.canvas.height);
      if (this.all.length) this.paths(area.ctx, this.all, area.baseW, area.baseH);
    },

    // Client coordinates to the area's base size, letterboxed like the drawing itself.
    toCanvas(area, clientX, clientY) {
      const rect = area.canvas.getBoundingClientRect();
      const w = area.canvas.width;
      const h = area.canvas.height;
      const scale = Math.min(w / area.baseW, h / area.baseH);
      const x = (clientX - rect.left - (w - area.baseW * scale) / 2) / scale;
      const y = (clientY - rect.top - (h - area.baseH * scale) / 2) / scale;
      return [Math.max(0, Math.min(area.baseW, x)), Math.max(0, Math.min(area.baseH, y))];
    },

    segment(ctx, x0, y0, x1, y1, baseW, baseH) {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const scale = Math.min(w / baseW, h / baseH);
      const offX = (w - baseW * scale) / 2;
      const offY = (h - baseH * scale) / 2;
      ctx.strokeStyle = getComputedStyle(ctx.canvas.parentNode).color;
      ctx.beginPath();
      ctx.moveTo(offX + x0 * scale, offY + y0 * scale);
      ctx.lineTo(offX + x1 * scale, offY + y1 * scale);
      ctx.stroke();
    },

    paths(ctx, paths, baseW, baseH) {
      paths.forEach((path) => {
        for (let i = 1; i < path.length; i++) this.segment(ctx, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1], baseW, baseH);
      });
    },

    clear() {
      this.areas.forEach((area) => area.ctx.clearRect(0, 0, area.canvas.width, area.canvas.height));
    },

    // A saved drawing (Drawings page) replaces whatever is on the canvases.
    show(paths) {
      this.all = [];
      this.user = [];
      this.current = [];
      this.clear();
      this.areas.forEach((area) => this.paths(area.ctx, paths, area.canvas.width, area.canvas.height));
      this.all = paths;
    },
  };

  function initDrawingOnce() {
    $(document).on('click', '.send-drawing', () => {
      const json = JSON.stringify(Draw.user);
      if (navigator.clipboard) navigator.clipboard.writeText(json).catch(() => {});
    });

    $(document).on('click', '.clear', () => {
      Draw.all = [];
      Draw.user = [];
      Draw.current = [];
      $('.by-who').hide();
      Draw.clear();
    });

    const needsDrawing = (e) => {
      if (Draw.user.length) return false;
      e.preventDefault();
      $('.drew-form .u-text-style-h1').first().text('Draw something first !');
      return true;
    };
    $(document).on('click', '.form-submit', (e) => { needsDrawing(e); });
    $(document).on('submit', '#wf-form-drawing-form', (e) => {
      if (needsDrawing(e)) return;
      $('#drawing-code').val(JSON.stringify(Draw.user));
    });

    // Drawings page: hovering or clicking an entry shows it on the canvases.
    $(document).on('mouseenter click', '.drawing-item-btn', function () {
      const item = $(this).closest('.drawing-item');
      let paths;
      try {
        paths = JSON.parse(item.find('.drawing-code').text().trim());
      } catch (e) {
        console.warn('[op] invalid drawing JSON');
        return;
      }
      Draw.show(paths);
      $('.drawing-item').removeClass('is-active');
      item.addClass('is-active');
    });
  }

  function initDrawAreas(container) {
    const page = STATE.page;
    const areas = qsa('.footer-draw', container);
    if (!areas.length) return;
    // Built when the footer comes near the screen, not on page load.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        Draw.init(entry.target, page);
        if (Draw.areas.has(entry.target)) io.unobserve(entry.target);
      });
    }, { rootMargin: '200px 0px' });
    areas.forEach((area) => io.observe(area));
    onCleanup(() => io.disconnect());
  }

  // Drawings page: the visitor's own drawing comes first, otherwise the first entry is shown.
  function initDrawingsPage(container) {
    const $c = $(container);
    if (!$c.find('.drawing-item-btn').length) return;
    if (Draw.user.length) {
      const clone = $c.find('.drawing-item:first-child').first().clone();
      clone.prependTo($c.find('.drawing-grid').first()).addClass('is-user');
      clone.find('.drawing-code').text(JSON.stringify(Draw.user));
      clone.find('.drawing-item-btn').trigger('click');
    } else {
      $c.find('.drawing-item:first-child .drawing-item-btn').first().trigger('click');
    }
  }

  /* 7. INTRO ---------------------------------------------------------------- */

  // Plays on the first visit of the session, on desktop, without reduced motion.
  // The head snippet hides .loader-1 before first paint when it has already played.
  // A click, a key or the wheel plays the rest three times faster.
  function initIntro(container) {
    window.opIntroStarted = true;
    const loader = qs('.loader-1');
    if (!loader || !container.classList.contains('is-home')) return;
    const first = qs('.home-logo.is-first', container);
    const target = qs('.home-logo.is-target', container);
    if (html.classList.contains('op-intro-seen') || !isDesktop() || reducedMotion.matches || !first || !target) {
      html.classList.add('op-intro-seen');
      return;
    }
    storage.set('sessionStorage', 'op-intro-seen', '1');

    gsap.set('.home-logo.is-first', { opacity: 1 });
    gsap.set('.home-logo.is-target', { opacity: 0 });
    const travel = target.getBoundingClientRect().top - first.getBoundingClientRect().top;
    const setWord = (word) => $('.load-word').text(word);

    const tl = gsap.timeline({
      defaults: { duration: 1, ease: 'power3.out' },
      onStart() {
        lockScroll('intro');
      },
      onComplete() {
        stopHurry();
        STATE.intro = null;
        setTimeout(() => refreshScrollTriggersAt(window.scrollY), 600);
        unlockScroll('intro');
      },
    });
    STATE.intro = tl;

    tl.to('.load-img-wrap', { minWidth: '29.7em', duration: 0.4, delay: 0.2, ease: 'opOvershoot' })
      .to('.load-quote-flex', { scale: 0.9, duration: 0.7, ease: 'opOvershoot' }, '<1.4')
      .to('.load-img-wrap', { minWidth: '81em', duration: 0.35, ease: 'opSnap' }, '<0.1')
      .to('.load-img-anim-wrap', { scale: 0.5, duration: 0.35, ease: 'opSnap' }, '<')
      .set('.load-word-wrap', { opacity: 1 }, '<0.05')
      .set('.load-img-anim-wrap', { opacity: 0 }, '<')
      .from('.load-word', { scale: 0.45, duration: 0.35, ease: 'opSnap' }, '<')
      .to('.loader-bk', { backgroundColor: '#E4E8C3', duration: 0.04 }, '<')
      .set('.loader-bk', { opacity: 0 }, '<')
      .set('.page_main', { backgroundColor: '#E4E8C3' }, '<')
      .to('.load-quote-flex', { color: '#356114', duration: 0.04 }, '<')
      .to('.loader-1', { color: '#062F31', duration: 0.04 }, '<')
      .to('.load-quote-flex', { rotate: -15, duration: 0.6, ease: 'elastic.inOut(1,1.2)' }, '<0.5')
      .add(() => setWord('clever'), '<0.3')
      .to('.load-img-wrap', { duration: 0.25, ease: 'opPop' }, '<')
      .set('.load-quote.is-01', { x: '7em' }, '<')
      .set('.load-quote.is-02', { x: '-7em' }, '<')
      .set('.load-quote-flex', { scale: 1.12 }, '<')
      .set('.page_main', { backgroundColor: '#B5B0FF' }, '<')
      .set('.load-quote-flex', { color: '#003133' }, '<')
      .to('.load-quote-flex', { rotate: 20, duration: 0.8, ease: 'elastic.inOut(1,0.8)' }, '<0.5')
      .add(() => setWord('wow'), '<0.35')
      .set('.load-quote.is-01', { x: '17em' }, '<')
      .set('.load-quote.is-02', { x: '-17em' }, '<')
      .set('.load-quote-flex', { scale: 1.45 }, '<')
      .set('.page_main', { backgroundColor: '#BBE0F1' }, '<')
      .set('.load-quote-flex', { color: '#356114' }, '<')
      .from('.home-logo', { yPercent: 90, opacity: 0, duration: 0.8, stagger: { amount: 0.2, from: 'end' }, ease: 'power3.out' }, '<0.35')
      .to('.home-logo.is-first', {
        y: travel,
        duration: 1.5,
        ease: 'power4.inOut',
        onComplete() {
          gsap.set('.home-logo.is-first', { opacity: 0 });
          gsap.set('.home-logo.is-target', { opacity: 1 });
        },
      }, '<')
      .to('.loader-bk', { opacity: 0, duration: 1.75, ease: 'expo.out' }, '<')
      .to('.load-quote-flex', { y: '-100vh', duration: 1.25, ease: 'power4.inOut' }, '<')
      .from('.blur-overlay.is-home', { backdropFilter: 'blur(4rem)', duration: 1.7, ease: 'power2.inOut' }, '<')
      .from('.section.is-hero', { duration: 0.8, ease: 'power3.inOut' }, '<')
      .to('.loader-title', { yPercent: -50, opacity: 0, duration: 0.3, stagger: { amount: 0.1, from: 'end' }, ease: 'power3.inOut' }, '<')
      .from('.nav', { opacity: 0 }, '<')
      .from('.top-spacing.is-top', { height: '100vh', duration: 1.5, ease: 'power4.inOut' }, '<')
      .to('.page_main', { backgroundColor: '#e6e6e6', duration: 1.2 }, '<')
      .set('.loader-1', { pointerEvents: 'none' }, '<');

    const hurry = () => {
      tl.timeScale(3);
      stopHurry();
    };
    function stopHurry() {
      loader.removeEventListener('pointerdown', hurry);
      window.removeEventListener('keydown', hurry);
      window.removeEventListener('wheel', hurry);
    }
    loader.addEventListener('pointerdown', hurry);
    window.addEventListener('keydown', hurry);
    window.addEventListener('wheel', hurry, { passive: true });
  }

  /* 8. NAV SCROLL ----------------------------------------------------------- */

  // The progressive blur and the nav gradient slide in over the first 400 px;
  // near the footer, the blur and the nav slide out.
  function initNavScroll(container) {
    inPage(() => {
      qsa('.progressive-blur_wrap, .nav-gradient', container).forEach((el) => {
        gsap.timeline({ scrollTrigger: { trigger: container, start: 'top top', end: 'top -400', scrub: true } })
          .to(el, { y: '0%' });
      });
      const footer = qs('.footer', container);
      if (!footer) return;
      qsa('.progressive-blur_wrap, .nav', container).forEach((el) => {
        gsap.timeline({ scrollTrigger: { trigger: footer, start: 'top 20%', end: 'top top', scrub: true } })
          .to(el, { y: '-100%' });
      });
    });
  }

  /* 9. SHOWCASE ------------------------------------------------------------- */

  // Hovering a tile cycles its visuals every 0.5 s; leaving shows the first one again.
  function initShowcase(container) {
    const loops = new Set();
    qsa('.showcase-work-visual', container).forEach((visual) => {
      let tl = null;
      const start = () => {
        if (tl) {
          tl.kill();
          loops.delete(tl);
          tl = null;
        }
        const frames = $(visual).find('.hover-visual').filter(function () {
          const src = $(this).find('img').attr('src') || '';
          return !src.includes('placeholder.svg');
        });
        if (!frames.length) return;
        if (frames.length === 1) {
          gsap.set(frames, { opacity: 1 });
          return;
        }
        const order = Array.from({ length: frames.length - 1 }, (_, i) => i + 1).concat(0);
        tl = gsap.timeline({ repeat: -1 });
        tl.set(frames, { opacity: 0 });
        tl.set(frames.eq(order[0]), { opacity: 1 });
        for (let i = 1; i < order.length; i++) {
          tl.to({}, { duration: 0.5 })
            .set(frames.eq(order[i - 1]), { opacity: 0 })
            .set(frames.eq(order[i]), { opacity: 1 });
        }
        tl.to({}, { duration: 0.5 });
        loops.add(tl);
      };
      const stop = () => {
        if (tl) {
          tl.kill();
          loops.delete(tl);
          tl = null;
        }
        const frames = $(visual).find('.hover-visual');
        set(frames, { opacity: 0 });
        set(frames.first(), { opacity: 1 });
      };
      listen(visual, 'mouseenter', start);
      listen(visual, 'mouseleave', stop);
      listen(visual, 'focusin', start);
      listen(visual, 'focusout', stop);
    });
    onCleanup(() => loops.forEach((tl) => tl.kill()));
  }

  /* 10. DRAWERS ------------------------------------------------------------- */

  // One drawer open at a time; a second click on the open one closes it.
  function initDrawers(container) {
    const timers = [];
    qsa('[class*="drawer-top"], [drawer-top]', container).forEach((top) => {
      if (!top.matches('a, button')) {
        top.setAttribute('role', 'button');
        top.setAttribute('tabindex', '0');
      }
      const item = $(top).closest('.drawer-item, [drawer-parent]');
      const toggle = () => {
        let count = item.data('clickCount') || 0;
        if (count === 1) {
          item.removeClass('open');
        } else {
          item.siblings().removeClass('open').data('clickCount', 0);
          item.siblings().find('[class*="drawer-top"], [drawer-top]').attr('aria-expanded', 'false');
          item.addClass('open');
        }
        top.setAttribute('aria-expanded', item.hasClass('open') ? 'true' : 'false');
        timers.push(setTimeout(() => ScrollTrigger.refresh(), 600));
        count++;
        if (count > 1) count = 0;
        item.data('clickCount', count);
      };
      top.setAttribute('aria-expanded', item.hasClass('open') ? 'true' : 'false');
      listen(top, 'click', toggle);
      listen(top, 'keydown', (e) => {
        if (top.matches('a, button') || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        toggle();
      });
    });
    onCleanup(() => timers.forEach(clearTimeout));
  }

  /* 11. QUOTES -------------------------------------------------------------- */

  // Each big quote turns a little as it crosses the screen (random amount and direction).
  function initQuotes(container) {
    if (reducedMotion.matches) return;
    inPage(() => {
      qsa('.about-bigquote-wrap', container).forEach((wrap) => {
        const quotes = qsa('.quote-wrap', wrap);
        if (!quotes.length) return;
        const base = gsap.getProperty(quotes[0], 'rotate');
        const extra = gsap.utils.random(-5, 15) * (Math.random() > 0.5 ? 1 : -1);
        gsap.timeline({ scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: true } })
          .from(quotes, { rotate: base + extra, ease: 'none' })
          .from(qsa('.quote', wrap), { ease: 'none' }, '<');
      });
    });
  }

  /* 12. ARCHIVE ------------------------------------------------------------- */

  // The case studies are fetched from a hidden page (/archive-panels by default, or the
  // URL in data-op-panels on .cs-coll-list) when the visitor shows intent, and cloned
  // into the page on demand. If the panels are already in the page, they are used as is.
  function createPanels(host) {
    const source = new Map();
    if (host) qsa('.cs-coll-item[data-work]', host).forEach((el) => source.set(el.getAttribute('data-work'), el));
    const inline = source.size > 0;
    let url = (host && host.getAttribute('data-op-panels')) || '/archive-panels';
    if (/^\/fr(\/|$)/.test(location.pathname) && url.charAt(0) === '/' && !/^\/fr\//.test(url)) url = '/fr' + url;
    let request = null;

    function load() {
      if (inline || !host) return Promise.resolve();
      if (!request) {
        request = fetch(url, { credentials: 'same-origin' })
          .then((response) => {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
            return response.text();
          })
          .then((text) => {
            const doc = new DOMParser().parseFromString(text, 'text/html');
            qsa('.cs-coll-item[data-work]', doc).forEach((el) => {
              const slug = el.getAttribute('data-work');
              if (!source.has(slug)) source.set(slug, el);
            });
            log('case studies loaded:', source.size);
          })
          .catch((e) => {
            request = null;
            throw e;
          });
      }
      return request;
    }

    // The live element for a slug, imported into the page the first time.
    function get(slug) {
      const el = source.get(slug);
      if (!el) return null;
      if (el.ownerDocument === document) return el;
      const live = document.importNode(el, true);
      host.appendChild(live);
      labelButtons(live);
      source.set(slug, live);
      return live;
    }

    // Intent (hover, focus): import the panel early so its first image starts loading.
    function prepare(slug) {
      load()
        .then(() => {
          const panel = get(slug);
          if (panel) warmImage(qs('.cs-small-thumb-wrap img', panel));
        })
        .catch(() => {});
    }

    return { load, get, prepare };
  }

  function initArchive(container) {
    const $c = $(container);
    const list = qs('.work-list', container);
    const host = qs('.cs-coll-list', container);
    const panels = createPanels(host);
    const ns = '.opArchive';
    const preview = (slug) => $c.find(`.work-project-img[data-work="${escapeAttr(slug)}"]`);
    const rowFor = (slug) => qs(`.work-item[data-work="${escapeAttr(slug)}"]`, container);
    let alignTop = false;
    let isAnimating = false;
    let pushed = false;
    let pendingClose = null;
    let colours = null;

    const controller = {
      openSlug(slug, options) {
        const row = rowFor(slug);
        if (row && !$(row).hasClass('active') && !isAnimating) toggleRow(row, options || {});
      },
    };

    onCleanup(() => $c.off(ns));

    // Hover: show the row's preview, warm the next ones, get the case study ready.
    $c.on('mouseenter' + ns, '.work-item, .archive-item', function () {
      const slug = this.getAttribute('data-work');
      if (!slug) return;
      preview(slug).addClass('is-active');
      warmNeighbours(this);
      if (host && $(this).hasClass('work-item')) panels.prepare(slug);
    });
    $c.on('mouseleave' + ns, '.work-item, .archive-item', function () {
      const slug = this.getAttribute('data-work');
      if (slug && !$(this).hasClass('active')) preview(slug).removeClass('is-active');
    });
    $c.on('focusin' + ns, '.work-item', function () {
      const slug = this.getAttribute('data-work');
      if (slug && host) panels.prepare(slug);
    });

    // The previews of the two rows above and below load ahead, so moving down the list stays instant.
    function warmNeighbours(row) {
      const warmRow = (el) => {
        const wrap = el && el.getAttribute('data-work') ? preview(el.getAttribute('data-work'))[0] : null;
        if (wrap) warmImage(qs('img', wrap));
      };
      let next = row.nextElementSibling;
      let prev = row.previousElementSibling;
      for (let i = 0; i < 2; i++) {
        warmRow(next);
        warmRow(prev);
        next = next && next.nextElementSibling;
        prev = prev && prev.previousElementSibling;
      }
    }

    if (!list) return;

    // Rows: a real link per project for the keyboard and for sharing (?project=slug).
    qsa('.work-item', list).forEach((row) => {
      const slug = row.getAttribute('data-work');
      const link = qs('a.link-block', row);
      if (slug && link) {
        link.setAttribute('href', location.pathname + '?project=' + encodeURIComponent(slug));
        link.setAttribute('data-barba-prevent', '');
        const title = qs('.work-title', row);
        if (title && title.textContent.trim()) link.setAttribute('aria-label', title.textContent.trim());
      }
      qsa('.visit-site-btn', row).forEach((a) => a.setAttribute('tabindex', '-1'));
    });

    $c.on('click' + ns, '.work-item', function (e) {
      if ($(e.target).closest('.visit-site-btn').length) return;
      e.preventDefault();
      if (isAnimating) return;
      toggleRow(this, {});
    });

    $c.on('click' + ns, '.close-archive', (e) => {
      e.preventDefault();
      const active = $c.find('.work-item.active');
      if (active.length) active.trigger('click');
    });

    function toggleRow(row, options) {
      const $row = $(row);
      const slug = row.getAttribute('data-work');
      if ($row.hasClass('active')) {
        const panel = panels.get(slug);
        if (panel) closeProject($row, $(panel), newTimeline(), options);
        return;
      }
      isAnimating = true;
      setCursor('wait');
      panels.load()
        .then(() => {
          const panel = panels.get(slug);
          if (!panel) throw new Error('no case study for ' + slug);
          return imageReady(qs('.cs-small-thumb-wrap img', panel)).then(() => panel);
        })
        .then((panel) => {
          isAnimating = false;
          if (!row.isConnected || STATE.archive !== controller) return;
          openProject($row, $(panel), newTimeline(), options);
        })
        .catch((err) => {
          isAnimating = false;
          setCursor('');
          warn('case study unavailable:', err && err.message);
        });
    }

    const newTimeline = () => gsap.timeline({ defaults: { duration: 0.2, ease: 'power2.out' } });

    function projectUrl(slug) {
      const url = new URL(location.href);
      if (slug) url.searchParams.set('project', slug);
      else url.searchParams.delete('project');
      return url.pathname + url.search + url.hash;
    }

    function openProject($row, $panel, tl, { fromHistory = false, deepLink = false } = {}) {
      isAnimating = true;
      setCursor('wait');
      if (!colours) colours = { bg: getComputedStyle(container).backgroundColor, text: getComputedStyle(container).color };
      $c.find('.work-item').removeClass('active');
      $c.find('.work-list').removeClass('active');
      $row.addClass('active');
      $c.find('.work-list').addClass('active');
      $('body').addClass('project-open');
      $panel.find('.close-archive').css('pointer-events', 'auto');
      $panel.addClass('is-cs-active cs-infos-active');
      $row.find('.visit-site-btn').attr('tabindex', '0');
      lockScroll('project');
      STATE.modal = { name: 'project', close: (options) => closeActive(options) };
      if (deepLink) {
        history.replaceState(modalState('project', { slug: $row.attr('data-work') }), '', projectUrl($row.attr('data-work')));
        pushed = false;
      } else if (!fromHistory) {
        history.pushState(modalState('project', { slug: $row.attr('data-work') }), '', projectUrl($row.attr('data-work')));
        pushed = true;
      } else {
        pushed = true;   // reopened with Forward: Back from here closes it again
      }
      const { fromYPercent, fromOp } = handleAlignment($row, $panel);
      animateOpenTransition($panel, tl, fromYPercent, fromOp);
      runFlipOpen($row, $panel);
    }

    function closeProject($row, $panel, tl, { fromHistory = false } = {}) {
      isAnimating = true;
      setCursor('wait');
      $panel.find('.close-archive').css('pointer-events', 'none');
      $panel.removeClass('cs-infos-active');
      $panel.find('.cs-small-img-thumb-flex').css('pointer-events', 'none');
      $row.find('.visit-site-btn').attr('tabindex', '-1');
      unlockScroll('project');
      if (STATE.modal && STATE.modal.name === 'project') STATE.modal = null;
      if (!fromHistory) {
        const state = history.state || {};
        if (pushed && state.opModal === 'project') {
          history.back();
        } else if (state.opModal === 'project' || new URLSearchParams(location.search).has('project')) {
          const clean = Object.assign({}, state);
          delete clean.opModal;
          delete clean.slug;
          history.replaceState(clean, '', projectUrl(null));
        }
      }
      pushed = false;
      animateCloseTransition($panel, tl);
      runFlipClose($row, $panel);
      const link = $row.find('a.link-block')[0];
      if (link && $panel[0].contains(document.activeElement)) link.focus({ preventScroll: true });
    }

    // Close from Escape, Back or a navigation; waits for an opening animation to finish.
    function closeActive(options = {}) {
      const $row = $c.find('.work-item.active');
      if (!$row.length) return;
      if (options.instant) {
        resetInstantly($row);
        return;
      }
      if (isAnimating) {
        pendingClose = options;
        return;
      }
      const panel = panels.get($row.attr('data-work'));
      if (panel) closeProject($row, $(panel), newTimeline(), options);
    }

    // Leaving the page with a case study open: no animation, nothing left behind on <body>.
    function resetInstantly($row) {
      const panel = panels.get($row.attr('data-work'));
      $c.find('.work-item').removeClass('active');
      $('body').removeClass('project-open');
      if (panel) $(panel).removeClass('is-cs-active cs-infos-active');
      unlockScroll('project');
      if (STATE.modal && STATE.modal.name === 'project') STATE.modal = null;
      isAnimating = false;
      pendingClose = null;
      setCursor('');
    }

    function handleAlignment($row, $panel) {
      const top = $panel.find('.cs-top-txt')[0];
      const credits = $panel.find('.cs-cred-grid')[0];
      const thumbs = $panel.find('.cs-small-img-thumb-flex')[0];
      if (!top || !credits || !thumbs) return { fromYPercent: 120, fromOp: 1 };
      const textFlex = $panel.find('.cs-txt-flex');
      const leftCol = $panel.find('.portfolio-left-col');
      const rowRect = $row[0].getBoundingClientRect();
      const topBottom = top.getBoundingClientRect().bottom;
      let creditsTop = credits.getBoundingClientRect().top;
      const thumbsTop = thumbs.getBoundingClientRect().top;
      if (creditsTop > thumbsTop) creditsTop = thumbsTop;
      if (rowRect.top < topBottom) textFlex.addClass('align-bottom');
      if (rowRect.bottom > creditsTop) {
        alignTop = true;
        textFlex.addClass('align-top');
        leftCol.addClass('align-top');
      }
      return { fromYPercent: alignTop ? -20 : 120, fromOp: alignTop ? 0 : 1 };
    }

    function animateOpenTransition($panel, tl, fromYPercent, fromOp) {
      const thumbs = $panel.find('.cs-small-thumb-contain:not(:first-child)');
      const topText = $panel.find('.cs-top-txt');
      const navs = $c.find('.nav');
      const credits = $panel.find('.cs-credit-rt p');
      to($c.find('.sticky-gradient-top').add(container), { backgroundColor: '#F5F5F5', color: '#1E1E1E', duration: 0.75, ease: 'power3.out' });
      to($c.find('.nav-gradient-white'), { opacity: 1, duration: 0.75, ease: 'power3.out' });
      to($c.find('.nav-gradient'), { opacity: 0, duration: 0.75, ease: 'power3.out' });
      to($c.find('.work-gradient'), { opacity: 0, duration: 0.15, ease: 'power3.out' });
      fromTo($panel.find('.close-contact-wrap'), { opacity: 0, y: '1rem' }, { opacity: 1, y: '0rem', duration: 0.5, delay: 0.25, ease: 'power3.out' });
      if (thumbs.length) tl.fromTo(thumbs, { yPercent: fromYPercent, opacity: fromOp }, { yPercent: 0, opacity: 1, duration: 0.5, stagger: { each: 0.05, from: 'end' }, ease: 'power3.out', delay: 0.25 }, '<0.3');
      if (topText.length) tl.fromTo(topText, { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.58 }, 0);
      if (navs.length) tl.fromTo(navs, { yPercent: 0 }, { yPercent: -100, duration: 0.8, ease: 'power2.inOut' }, 0);
      if (credits.length) tl.fromTo(credits, { opacity: 0, yPercent: 20 }, { opacity: 1, yPercent: 0, duration: 1.25, delay: 0.62, stagger: 0.0175 }, 0);
    }

    function animateCloseTransition($panel, tl) {
      const bg = colours ? colours.bg : '#E4E8C3';
      const text = colours ? colours.text : '#356114';
      const thumbs = $panel.find('.cs-small-thumb-contain:not(:first-child)');
      const navs = $c.find('.nav');
      to($panel.find('.close-contact-wrap'), { opacity: 0, y: '1rem', duration: 0.5, ease: 'power3.in' });
      to($c.find('.sticky-gradient-top').add(container), { backgroundColor: bg, color: text, duration: 0.75, ease: 'power3.in' });
      to($c.find('.nav-gradient-white, .work-gradient-white'), { opacity: 0, duration: 0.75, ease: 'power3.in' });
      to($c.find('.nav-gradient'), { opacity: 1, duration: 0.75, ease: 'power3.in' });
      to($c.find('.work-gradient'), { opacity: 1, duration: 0.75, ease: 'power3.in', delay: 0.25 });
      if (thumbs.length) tl.to(thumbs, { yPercent: alignTop ? 0 : 120, opacity: 0, duration: 0.35, stagger: 0.015, ease: 'power3.in' }, 0);
      if (navs.length) tl.fromTo(navs, { yPercent: -100 }, { yPercent: 0, duration: 0.8, ease: 'power2.inOut' }, 0);
    }

    // The row's preview flies into the case study's first thumbnail.
    function runFlipOpen($row, $panel) {
      const id = $row.attr('data-work');
      const $source = $c.find(`.fixed-img-wrap .project-img[data-flip-id="${escapeAttr(id)}"]`);
      const $target = $panel.find(`.cs-small-thumb-wrap[data-flip-id="${escapeAttr(id)}"]`);
      const $preview = preview(id);
      if (!window.Flip || !$source.length || !$target.length) {
        warn('Flip source or target not found for', id);
        flipOpenDone($panel);
        return;
      }
      $preview.addClass('is-active');   // displayed before measuring, also when the row was not hovered (keyboard, deep link)
      const state = Flip.getState(`[data-flip-id="${escapeAttr(id)}"]`);
      Flip.from(state, {
        duration: 1,
        ease: 'power4.inOut',
        scale: true,
        targets: $target[0],
        onEnter: (els) => gsap.set(els, { opacity: 1 }),
        onLeave: (els) => gsap.set(els, { opacity: 0 }),
        onStart() {
          set($preview.find('.project-img'), { opacity: 0 });
          set($c.find('.project-img-ratio'), { opacity: 0 });
        },
        onComplete: () => flipOpenDone($panel),
      });
    }

    function flipOpenDone($panel) {
      isAnimating = false;
      setCursor('');
      const close = $panel.find('.close-archive')[0];
      if (close && !pendingClose) close.focus({ preventScroll: true });
      if (pendingClose) {
        const options = pendingClose;
        pendingClose = null;
        closeActive(options);
      }
    }

    // The thumbnail flies back to the row's preview.
    function runFlipClose($row, $panel) {
      const id = $row.attr('data-work');
      const $thumb = $panel.find(`.cs-small-thumb-wrap[data-flip-id="${escapeAttr(id)}"]`);
      const $source = $c.find(`.fixed-img-wrap .project-img[data-flip-id="${escapeAttr(id)}"]`);
      const $preview = preview(id);
      const done = () => {
        $c.find('.work-item').removeClass('active');
        $('body').removeClass('project-open');
        $panel.removeClass('is-cs-active');
        $c.find('.cs-txt-flex, .portfolio-left-col').removeClass('align-top align-bottom');
        alignTop = false;
        isAnimating = false;
        setCursor('');
      };
      if (!window.Flip || !$thumb.length || !$source.length) {
        warn('Flip close: missing elements for', id);
        done();
        return;
      }
      $preview.addClass('is-active');   // the preview is display: none unless active; Flip needs it to measure where to land
      const state = Flip.getState($source[0]);
      Flip.to(state, {
        targets: $thumb[0],
        duration: 1,
        ease: 'power4.inOut',
        scale: true,
        onEnter: (els) => gsap.set(els, { opacity: 1 }),
        onLeave: (els) => gsap.set(els, { opacity: 0 }),
        onComplete() {
          done();
          gsap.set([$thumb[0], $source[0]], { clearProps: 'all' });
          set($preview.find('.project-img'), { opacity: 1 });
          set($c.find('.project-img-ratio'), { opacity: 1 });
          if (!$row.is(':hover')) $preview.removeClass('is-active');
        },
      });
    }

    // Filter and sort (replaces Finsweet cmsfilter, cmssort and cmsload).
    initListTools(container, list);

    STATE.archive = controller;
    onCleanup(() => {
      if (STATE.archive === controller) STATE.archive = null;
      const active = $c.find('.work-item.active');
      if (active.length) resetInstantly(active);
    });

    // Deep link: /archives?project=slug opens that case study.
    const deep = new URLSearchParams(location.search).get('project');
    const deepRow = deep && rowFor(deep);
    if (deepRow && host) {
      // Rows arriving with a page transition are finished first, so the alignment is measured on the final layout.
      gsap.getTweensOf(qsa('.work-item', container)).forEach((tween) => tween.progress(1));
      const rect = deepRow.getBoundingClientRect();
      scrollToY(Math.max(0, window.scrollY + rect.top - (window.innerHeight - rect.height) / 2));
      setTimeout(() => controller.openSlug(deep, { deepLink: true }), 300);
    } else if (host) {
      idle(() => panels.load().catch((e) => warn('case studies not loaded yet:', e.message)), 3000);
    }
  }

  function initListTools(container, list) {
    const input = qs('input[fs-cmsfilter-field]', container);
    const triggers = qsa('[fs-cmssort-element="trigger"]', container).filter((t) => !t.closest('.w-pagination-wrapper'));
    const empty = qs('[fs-cmsfilter-element="empty"]', container);
    const hideWhileSearching = qsa('[fs-cmsfilter-element="hide"]', container);
    const industryLabel = qs('.industry-ref', container);
    const industryLabelText = industryLabel ? industryLabel.textContent : '';
    let order = qsa(':scope > .work-item', list);
    let query = '';
    let sort = { field: null, dir: 0 };
    const collator = new Intl.Collator(html.getAttribute('lang') || 'en', { numeric: true, sensitivity: 'base' });
    const keys = input ? input.getAttribute('fs-cmsfilter-field').split(',').map((k) => k.trim()).filter(Boolean) : [];
    const texts = new WeakMap();

    function fieldTexts(row) {
      if (!texts.has(row)) {
        const values = [];
        keys.forEach((key) => qsa(`[fs-cmsfilter-field="${key}"]`, row).forEach((el) => values.push(el.textContent.toLowerCase())));
        texts.set(row, values);
      }
      return texts.get(row);
    }

    const matches = (row) => !query || fieldTexts(row).some((text) => text.includes(query));

    function render(animate) {
      const visible = order.filter(matches);
      const keep = new Set(visible);
      order.forEach((row) => {
        if (!keep.has(row) && row.parentNode === list) row.remove();
      });
      visible.forEach((row) => list.appendChild(row));
      if (empty) empty.style.display = visible.length ? 'none' : '';
      if (animate && !reducedMotion.matches && visible.length) {
        gsap.fromTo(visible, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out', overwrite: 'auto', clearProps: 'opacity' });
      }
      ScrollTrigger.refresh();
    }

    function sortValue(row, field) {
      const el = qs(`[fs-cmssort-field="${field}"]`, row);
      const text = el ? el.textContent.trim() : '';
      if (el && el.getAttribute('fs-cmssort-type') === 'number') {
        const n = parseFloat(text.replace(/[^0-9.-]/g, ''));
        return Number.isNaN(n) ? -Infinity : n;
      }
      return text;
    }

    function applySort() {
      if (!sort.field) return;
      order = order
        .map((row, i) => ({ row, i, value: sortValue(row, sort.field) }))
        .sort((a, b) => {
          const diff = typeof a.value === 'number' ? a.value - b.value : collator.compare(a.value, b.value);
          return diff * sort.dir || a.i - b.i;
        })
        .map((entry) => entry.row);
    }

    const ascClass = (trigger) => trigger.getAttribute('fs-cmssort-asc') || 'fs-cmssort_asc';
    const descClass = (trigger) => trigger.getAttribute('fs-cmssort-desc') || 'fs-cmssort_desc';

    // First click sorts ascending (arrow turned, class is-active), the next ones flip it.
    triggers.forEach((trigger) => {
      listen(trigger, 'click', (e) => {
        e.preventDefault();
        const field = trigger.getAttribute('fs-cmssort-field');
        sort = { field, dir: sort.field === field ? -sort.dir : 1 };
        triggers.forEach((t) => t.classList.remove(ascClass(t), descClass(t)));
        trigger.classList.add(sort.dir === 1 ? ascClass(trigger) : descClass(trigger));
        applySort();
        render(true);
      });
    });

    if (empty) empty.style.display = 'none';
    if (!input) return;

    const params = new URLSearchParams(location.search);
    const industry = params.get('industry');
    const initial = industry || params.get('search');
    if (initial) {
      input.value = initial;
      if (industry && industryLabel) industryLabel.textContent = industry;
    }

    let urlTimer = null;
    let inputTimer = null;
    function update(fromUser) {
      query = input.value.trim().toLowerCase();
      input.classList.toggle('fs-cmsfilter_active', !!query);
      hideWhileSearching.forEach((el) => { el.style.display = query ? 'none' : ''; });
      if (fromUser && !query && industryLabel) industryLabel.textContent = industryLabelText;
      render(fromUser);
      if (!fromUser) return;
      clearTimeout(urlTimer);
      urlTimer = setTimeout(() => {
        const url = new URL(location.href);
        url.searchParams.delete('industry');
        if (query) url.searchParams.set('search', input.value.trim());
        else url.searchParams.delete('search');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }, 300);
    }
    listen(input, 'input', () => {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => update(true), 50);
    });
    onCleanup(() => {
      clearTimeout(urlTimer);
      clearTimeout(inputTimer);
    });
    if (initial) update(false);
  }

  /* 13. PREFETCH ------------------------------------------------------------ */

  // Barba already fetches a page's HTML when a link is hovered. On top of that, after a
  // short dwell, the first images of that page (the ones that load at once) are requested.
  function initPrefetch() {
    const warmed = new Set();
    let timer = 0;
    const prefetchable = (a) => {
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-barba-prevent')) return false;
      const url = new URL(a.href, location.href);
      return url.origin === location.origin && url.pathname !== location.pathname;
    };
    const warm = (a) => {
      const href = new URL(a.href, location.href).href;
      if (warmed.has(href)) return;
      warmed.add(href);
      barba.prefetch(href);
      const entry = barba.cache.get(href);
      if (!entry || !entry.request) return;
      Promise.resolve(entry.request).then((text) => {
        if (typeof text !== 'string') return;
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const root = qs('[data-barba="container"]', doc) || doc.body;
        qsa('img[src]', root)
          .filter((img) => img.getAttribute('loading') !== 'lazy')
          .slice(0, 4)
          .forEach((img) => {
            const im = new Image();
            if (img.getAttribute('sizes')) im.sizes = img.getAttribute('sizes');
            if (img.getAttribute('srcset')) im.srcset = img.getAttribute('srcset');
            im.src = img.getAttribute('src');
          });
      }).catch(() => warmed.delete(href));
    };
    document.addEventListener('pointerover', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!prefetchable(a)) return;
      clearTimeout(timer);
      timer = setTimeout(() => warm(a), 65);
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest && e.target.closest('a[href]')) clearTimeout(timer);
    }, { passive: true });
    document.addEventListener('focusin', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (prefetchable(a)) warm(a);
    });
  }

  /* 14. TRANSITIONS --------------------------------------------------------- */

  // Leave: the current page takes the next page's colours (background, nav text) while
  // its content fades out; the next page waits hidden, fixed at the top. Then arrive.
  function leaveTransition(data) {
    const next = data.next.container;
    const current = data.current.container;
    const nextStyle = getComputedStyle(next);
    const background = nextStyle.backgroundColor;
    const color = nextStyle.color;
    next.classList.add('fixed');
    gsap.set(next, { opacity: 0 });
    if (reducedMotion.matches) {
      return gsap.to(next, { opacity: 0, duration: 0.05, onComplete: () => setCursor('') });
    }
    if (isNavLogoBreakpoint()) {
      if (next.getAttribute('data-barba-namespace') === 'home') {
        to(qsa('.nav-logo-wrap', current), { yPercent: -60, duration: 0.35, opacity: 0, ease: 'power3.in' });
      }
      if (current.getAttribute('data-barba-namespace') === 'home') {
        set(qsa('.nav-logo-wrap', next), { yPercent: -60, opacity: 0 });
      }
    }
    gsap.to(current, { backgroundColor: background, delay: 0.25, duration: 0.35, ease: 'power3.in' });
    to(qsa('.nav', current), { color, delay: 0.25, duration: 0.35, ease: 'power3.in' });
    to(qsa('.page_scroll', current), { opacity: 0, duration: 0.25, ease: 'power3.in' });
    return gsap.to(next, { opacity: 0, delay: 0.5, duration: 0.1, onComplete: () => setCursor('') });
  }

  // Arrival animations of the new page (none on a hard load, as before).
  function enterAnimations(container) {
    if (reducedMotion.matches) {
      set(qsa('.nav-logo-wrap', container), { clearProps: 'transform,opacity' });
      return;
    }
    const q = (selector) => qsa(selector, container);
    inPage(() => {
      const headers = q('[about-header]');
      if (headers.length && window.SplitText) {
        const split = SplitText.create(headers, { type: 'lines' });
        const onResize = () => {
          window.removeEventListener('resize', onResize);
          gsap.killTweensOf(split.lines);
          split.revert();
        };
        gsap.from(split.lines, {
          opacity: 0,
          yPercent: 40,
          stagger: 0.01,
          duration: 1.25,
          ease: 'power2.inOut',
          onComplete: () => {
            window.removeEventListener('resize', onResize);
            split.revert();
          },
        });
        window.addEventListener('resize', onResize);
        onCleanup(() => window.removeEventListener('resize', onResize));
      }
    });
    to(q('.nav-logo-wrap'), { yPercent: 0, duration: 0.75, opacity: 1, ease: 'power3.inOut' });
    from(q('.form-filters'), { opacity: 0, yPercent: 40, stagger: 0.01, duration: 1.5, ease: 'power2.inOut', clearProps: 'opacity,transform' });
    from(q('.work-item'), { opacity: 0, yPercent: 90, stagger: 0.01, duration: 1.25, ease: 'power2.inOut', clearProps: 'opacity,transform' });
    from(q('.about-grid > *, .indent-lg-switcher.is-about, .mobile-services'), { opacity: 0, yPercent: 10, stagger: 0.02, duration: 1.25, ease: 'power2.inOut', clearProps: 'opacity,transform' });
    from(q('.blur-overlay.is-home'), { backdropFilter: 'blur(4rem)', duration: 1.25, ease: 'power2.inOut', clearProps: 'all' });
    from(q('.section-content.is-home-hero .home-cta-flex'), { opacity: 0, y: '4rem', stagger: 0.02, duration: 1.25, ease: 'power2.inOut', clearProps: 'opacity,transform' });
    if (isNavLogoBreakpoint()) {
      from(q('.section.is-hero'), { opacity: 0, y: '4rem', stagger: 0.02, duration: 1.25, ease: 'power2.inOut', clearProps: 'opacity,transform' });
    }
    from(q('.project-img.is-fixed'), { xPercent: 120, duration: 1.25, ease: 'power2.inOut', clearProps: 'transform' });
  }

  function syncDocument(nextHtml) {
    if (!nextHtml) return;
    const doc = new DOMParser().parseFromString(nextHtml, 'text/html');
    ['data-wf-page', 'lang'].forEach((name) => {
      const value = doc.documentElement.getAttribute(name);
      if (value) html.setAttribute(name, value);
    });
  }

  // webflow.js only needs a restart when the new page has something it drives (forms here).
  const WEBFLOW_NEEDS = '.w-form, .w-dropdown, .w-tabs, .w-slider, .w-lightbox, .w-nav, .w-background-video, .w-video, .w-embed-youtubevideo, [data-w-id]';
  function resetWebflow(container) {
    if (!window.Webflow || !container.querySelector(WEBFLOW_NEEDS)) return;
    Webflow.destroy();
    $(document).off('click.wf-scroll click.wf-empty-link');   // ready() binds these again; destroy() leaves the old ones
    Webflow.ready();
    let ix2 = null;
    try {
      ix2 = Webflow.require('ix2');
    } catch (e) {
      ix2 = null;
    }
    if (ix2 && ix2.init) ix2.init();
  }

  function markCurrentLinks(container) {
    $('.w--current').removeClass('w--current');
    $(container).find('a').each(function () {
      if ($(this).attr('href') === location.pathname) $(this).addClass('w--current');
    });
  }

  function playVideos(container) {
    qsa('video', container).forEach((video) => {
      const src = video.getAttribute('src') || (qs('source[src]', video) || {}).src;
      if (!src || !video.hasAttribute('autoplay')) return;
      const playing = video.play();
      if (playing && playing.catch) playing.catch(() => {});
    });
  }

  /* 15. BARBA --------------------------------------------------------------- */

  function initBarba() {
    if (!window.barba) return;

    barba.hooks.before(() => {
      if (STATE.intro) STATE.intro.progress(1);   // leaving the home mid-intro (Back button): finish it, release the scroll
      setCursor('wait');
      if (STATE.modal) STATE.modal.close({ instant: true, fromHistory: true });
      lockScroll('transition');
      endPage(STATE.page);
    });

    barba.init({
      preventRunning: true,
      timeout: 5000,
      prevent: ({ el }) => !!(el && (isContactLink(el) || el.matches('a.link-block'))),
      transitions: [{
        name: 'op-colour-fade',
        enter(data) {
          const tween = safely('leave transition', () => leaveTransition(data));
          return tween || Promise.resolve();
        },
        after(data) {
          const next = data.next.container;
          STATE.navigated = true;
          STATE.path = location.pathname;
          safely('document', () => syncDocument(data.next.html));
          scrollToY(0);
          safely('webflow', () => resetWebflow(next));
          startPage(next);
          safely('arrival', () => enterAnimations(next));
          next.classList.remove('fixed');
          next.removeAttribute('style');
          safely('current links', () => markCurrentLinks(next));
          everyPage(next);
          safely('videos', () => playVideos(next));
          setTimeout(() => unlockScroll('transition'), 100);
          ScrollTrigger.refresh();
          setCursor('');
        },
      }],
    });
  }

  /* 16. BOOT ---------------------------------------------------------------- */

  function everyPage(container) {
    const has = (selector) => !!container.querySelector(selector);
    container.classList.remove('is-cs');
    labelButtons(container);
    safely('nav scroll', () => initNavScroll(container));
    if (has('.showcase-work-visual')) safely('showcase', () => initShowcase(container));
    if (has('[class*="drawer-top"], [drawer-top]')) safely('drawers', () => initDrawers(container));
    if (has('.about-bigquote-wrap')) safely('quotes', () => initQuotes(container));
    if (has('.footer-draw')) safely('drawing areas', () => initDrawAreas(container));
    if (has('.drawing-item-btn')) safely('drawings page', () => initDrawingsPage(container));
    if (has('.work-item, .archive-item')) safely('archive', () => initArchive(container));
    safely('contact links', () => markContactLinks(container));
  }

  function once() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    safely('eases', initEases);
    safely('lenis', initLenis);
    safely('scroll keys', initScrollKeys);
    safely('history', initHistory);
    safely('contact', initContact);
    safely('drawing', initDrawingOnce);
    safely('form guard', initFormGuard);
  }

  function boot() {
    if (inEditor()) {
      html.classList.add('op-intro-seen');
      return;
    }
    const container = qs('[data-barba="container"]') || qs('.page_main');
    if (!container) return;
    once();
    startPage(container);
    safely('intro', () => initIntro(container));
    everyPage(container);
    safely('barba', initBarba);
    safely('prefetch', () => window.barba && initPrefetch());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
    log('v' + VERSION + ' ready on', container.getAttribute('data-barba-namespace') || '(no namespace)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
