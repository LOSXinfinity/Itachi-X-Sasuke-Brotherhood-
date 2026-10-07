/* =========================================================================
   兄弟 — Itachi & Sasuke
   app.js — boots smooth scroll, the preloader, the two scroll-scrubbed
   frame sequences and every section's motion. Effects live in fx.js.
   ========================================================================= */
(function () {
  'use strict';

  const { clamp, splitText, splitWords, decrypt } = window.FX;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  // 0 → 1 → 0 across [a, b], with a soft edge on both sides
  const windowed = (p, a, b, edge = 0.03) => Math.min(range(p, a, a + edge), 1 - range(p, b - edge, b));

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  if (reduced) root.classList.add('reduced');
  if (finePointer && !reduced) root.classList.add('has-cursor');

  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* =====================================================================
     SMOOTH SCROLL (Lenis → ScrollTrigger)
     ===================================================================== */
  let lenis = null;
  let scrollVel = 0;
  if (!reduced && window.Lenis && hasGsap) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.85 });
    lenis.on('scroll', e => { scrollVel = e.velocity || 0; ScrollTrigger.update(); });
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
    window.__lenis = lenis; // handy for QA from the console
  } else {
    let lastY = scrollY;
    addEventListener('scroll', () => { scrollVel = scrollY - lastY; lastY = scrollY; }, { passive: true });
  }
  const velocityRef = () => { const v = scrollVel; scrollVel *= 0.9; return v; };

  function scrollToTarget(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
    else (typeof target === 'number' ? scrollTo({ top: target }) : target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
  }

  /* =====================================================================
     FRAME SEQUENCE — a sticky canvas scrubbed by its section's scroll.
     keys is a piecewise [progress, frame] map so beats can be held or rushed.
     ===================================================================== */
  const FW = 1280, FH = 720;

  function createSequence({ section, stage, canvas, count, path, keys, focusX = 0.5, blend = () => true, zoom = () => 1, onRender }) {
    const ctx = canvas.getContext('2d');
    const imgs = new Array(count);
    let W = 0, H = 0, needsDraw = true, loadStarted = false;

    function load(onEach) {
      if (loadStarted) return Promise.resolve();
      loadStarted = true;
      return Promise.all(Array.from({ length: count }, (_, i) => new Promise(res => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { imgs[i] = img; needsDraw = true; onEach && onEach(); res(); };
        img.onerror = () => { onEach && onEach(); res(); };
        img.src = path(i);
      })));
    }

    const frameAt = p => {
      for (let i = 1; i < keys.length; i++) {
        const [p0, f0] = keys[i - 1], [p1, f1] = keys[i];
        if (p <= p1) return lerp(f0, f1, (p - p0) / (p1 - p0 || 1));
      }
      return count - 1;
    };
    // nearest frame that has arrived, so a slow network still shows something
    const nearest = i => {
      for (let d = 0; d < count; d++) {
        if (imgs[i - d]) return imgs[i - d];
        if (imgs[i + d]) return imgs[i + d];
      }
      return null;
    };

    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = stage.clientWidth; H = stage.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      needsDraw = true;
    }

    function draw(p) {
      const f = frameAt(p);
      const a = Math.floor(f), b = Math.min(count - 1, a + 1), frac = f - a;
      const fa = blend(f) ? nearest(a) : nearest(Math.round(f));
      ctx.clearRect(0, 0, W, H);
      if (!fa) return;

      // landscape: cover the stage. portrait: a 16:9 frame can't cover a tall
      // screen without losing the scene, so show a wide band and feather it out.
      const portrait = W / H < 0.8;
      const s = (portrait ? (W * 2.1) / FW : Math.max(W / FW, H / FH)) * zoom(p);
      const dw = FW * s, dh = FH * s;
      const dx = clamp(W / 2 - focusX * dw, W - dw, 0);
      const dy = portrait ? H * 0.48 - dh / 2 : (H - dh) / 2;

      ctx.globalAlpha = 1;
      ctx.drawImage(fa, dx, dy, dw, dh);
      if (blend(f) && frac > 0.001 && imgs[b]) { ctx.globalAlpha = frac; ctx.drawImage(imgs[b], dx, dy, dw, dh); ctx.globalAlpha = 1; }

      if (portrait) {
        ctx.globalCompositeOperation = 'destination-in';
        const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.16, 'rgba(0,0,0,1)');
        g.addColorStop(0.84, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    let target = 0, current = 0, lastDrawn = -1, visible = false, lastT = performance.now();
    resize();
    addEventListener('resize', resize);
    ScrollTrigger.create({ trigger: section, start: 'top top', end: 'bottom bottom', onUpdate: s => { target = s.progress; } });
    FX.whileVisible(section, v => { visible = v; if (v) lastT = performance.now(); }, '0px');

    gsap.ticker.add(() => {
      if (!visible) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      // time-based easing: same feel at 30, 60 or 120 fps
      current += (target - current) * (1 - Math.pow(0.86, dt * 60));
      if (Math.abs(target - current) < 0.0002) current = target;
      if (current !== lastDrawn || needsDraw) { draw(current); needsDraw = false; lastDrawn = current; }
      onRender && onRender(current, frameAt(current), now / 1000);
    });

    return { load, frameAt };
  }

  /* =====================================================================
     PRELOADER
     ===================================================================== */
  const HERO_COUNT = 70;
  let heroSeq = null;

  function preload() {
    const bar = $('[data-loader-bar]');
    const pct = $('[data-loader-pct]');
    const kanji = $('[data-loader-kanji]');
    let done = 0, shown = 0;
    const tick = () => { done++; };
    const anim = () => {
      shown = lerp(shown, done / HERO_COUNT, 0.16);
      if (bar) bar.style.transform = `scaleX(${shown})`;
      if (pct) pct.textContent = String(Math.round(shown * 100)).padStart(2, '0');
      if (kanji) kanji.style.setProperty('--p', (shown * 100).toFixed(2));
      if (shown < 0.995) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
    const frames = heroSeq ? heroSeq.load(tick) : Promise.resolve();
    const minTime = new Promise(r => setTimeout(r, reduced ? 0 : 1200));
    const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();
    // never trap the visitor behind the loader
    const cap = new Promise(r => setTimeout(r, 9000));
    return Promise.race([Promise.all([frames, minTime, fonts]), cap]);
  }

  function dismissLoader() {
    const loader = $('[data-loader]');
    const pct = $('[data-loader-pct]');
    const bar = $('[data-loader-bar]');
    const kanji = $('[data-loader-kanji]');
    if (pct) pct.textContent = '100';
    if (bar) bar.style.transform = 'scaleX(1)';
    if (kanji) { kanji.style.setProperty('--p', 100); kanji.classList.add('is-full'); }
    setTimeout(() => {
      loader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      scrollTo(0, 0);
      if (lenis) lenis.start();
      heroEntrance();
      setTimeout(() => loader.remove(), 1600);
      // QA: ?y=0.4 jumps to 40% of the page once it's up
      const y = Number(new URLSearchParams(location.search).get('y'));
      if (y > 0) {
        const top = (document.documentElement.scrollHeight - innerHeight) * y;
        lenis ? lenis.scrollTo(top, { immediate: true }) : scrollTo(0, top);
      }
    }, reduced ? 0 : 600); // let the kanji fill before the doors slide
  }

  /* =====================================================================
     01 · HERO — the hand, the step, the touch, the memory
     ===================================================================== */
  function initHero() {
    const hero = $('[data-hero]');
    const stage = $('[data-hero-stage]');
    const canvas = $('[data-hero-canvas]');
    const flash = $('[data-flash]');
    const intro = $('[data-intro]');
    const caps = $$('[data-cap]');
    const final = $('[data-final]');
    const finalJp = $('[data-final-jp]');
    const hint = $('[data-scroll-hint]');
    const typeCols = $$('[data-hy]');

    if (reduced || !hasGsap) {
      final.style.opacity = 1;
      hint.style.display = 'none';
      return;
    }

    const rain = FX.glyphRain($('[data-rain]'));
    const jpChars = splitText(finalJp);

    // scroll → frame: hand reaches (0–18), brothers face each other (–33),
    // the poke lands (–41), white-out (–49), and they are children again (–69)
    const KEYS = [[0, 0], [0.26, 18], [0.45, 33], [0.57, 41], [0.67, 50], [0.86, 69], [1, 69]];
    const CAP_WINDOWS = [[0.05, 0.24], [0.27, 0.43], [0.46, 0.58], [0.69, 0.84]];
    let activeCap = -1;

    heroSeq = createSequence({
      section: hero, stage, canvas, count: HERO_COUNT,
      path: i => `media/hero/f_${String(i + 1).padStart(3, '0')}.webp`,
      keys: KEYS, focusX: 0.54,
      // the camera pans and cuts until the memory settles; only blend the slow part
      blend: f => f >= 50,
      zoom: p => 1 + 0.06 * easeInOut(range(p, 0.3, 0.6)) - 0.02 * range(p, 0.67, 0.86),
      onRender(p, f) {
        typeCols.forEach(el => { el.style.transform = `translate3d(0,${Number(el.dataset.hy) * p}vh,0)`; });
        rain.setRed(range(p, 0.4, 0.58));

        // intro copy
        const introOut = range(p, 0.012, 0.06);
        intro.style.opacity = 1 - introOut;
        intro.style.transform = `translate3d(0,${-50 * introOut}px,0)`;
        intro.style.filter = introOut > 0 && introOut < 1 ? `blur(${introOut * 8}px)` : '';
        hint.style.opacity = 1 - range(p, 0, 0.03);

        // captions
        let nowCap = -1;
        caps.forEach((el, i) => {
          const [a, b] = CAP_WINDOWS[i];
          const o = windowed(p, a, b);
          el.style.opacity = o;
          el.style.transform = `translate3d(0,${(1 - o) * 26}px,0)`;
          if (o > 0.5) nowCap = i;
        });
        if (nowCap !== activeCap) {
          activeCap = nowCap;
          if (nowCap >= 0) decrypt($('[data-decrypt]', caps[nowCap]));
        }

        // the frames white out on their own; this carries the bloom past the canvas edges
        flash.style.opacity = Math.max(0, 1 - Math.abs(f - 46) / 5) * 0.6;
        // a small kick as the fingers land
        const hit = Math.max(0, 1 - Math.abs(f - 41.5) / 1.6);
        stage.style.transform = hit > 0.05 ? `translate3d(${(Math.random() - 0.5) * 9 * hit}px,${(Math.random() - 0.5) * 9 * hit}px,0)` : '';

        // the line: each glyph settles like wet ink
        const e = range(p, 0.86, 0.96);
        final.style.opacity = e > 0 ? 1 : 0;
        canvas.style.opacity = 1 - 0.3 * e;
        jpChars.forEach((c, i) => {
          const ci = easeOut(clamp(e * 1.9 - i * 0.14, 0, 1));
          c.style.opacity = ci;
          c.style.transform = `translate3d(0,${(1 - ci) * 46}px,0) scale(${1.5 - 0.5 * ci})`;
          c.style.filter = ci < 1 ? `blur(${(1 - ci) * 12}px)` : '';
        });
        final.style.setProperty('--e', range(e, 0.55, 1));
      },
    });
  }

  function heroEntrance() {
    if (reduced || !hasGsap) return;
    const jp = splitText($('.hero__title-jp'));
    const en = splitText($('.hero__title-en'));
    const tl = gsap.timeline({ delay: 0.5 });
    tl.from('.hero__intro .eyebrow', { y: 20, opacity: 0, duration: 0.9, ease: 'power3.out' })
      .from(jp, { opacity: 0, scale: 1.6, filter: 'blur(14px)', duration: 1.3, stagger: 0.16, ease: 'expo.out' }, '-=0.5')
      .from(en, { yPercent: 115, rotate: 5, duration: 1.1, stagger: 0.026, ease: 'expo.out' }, '-=1')
      .from('.hero__sub', { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out' }, '-=0.7')
      .from('.hero__type .ht', { opacity: 0, duration: 1.8, stagger: 0.08, ease: 'power2.out' }, 0)
      .from('.hero__scroll', { opacity: 0, duration: 1.1 }, 0.9);
  }

  /* =====================================================================
     02 · RAIN — doors slide open on the image, layers drift at their own pace
     ===================================================================== */
  function initRain() {
    FX.scrollVelocity($('[data-velo]'), { baseVelocity: 60, velocityRef });
    if (reduced || !hasGsap) return;

    const sec = $('[data-rain-sec]');
    const wrap = $('[data-rain-wrap]');
    const storm = FX.downpour($('[data-downpour]'));
    const hChars = splitText($('[data-rain-h]'));
    const words = splitWords($('[data-scroll-words]', sec));

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sec, start: 'top 75%', end: 'bottom bottom', scrub: 0.8 },
    });
    tl.fromTo('[data-rain-frame]', { clipPath: 'inset(18% 49.5% 18% 49.5%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut', duration: 0.42 }, 0)
      .fromTo('[data-rain-img]', { scale: 1.45, yPercent: -5 }, { scale: 1.06, yPercent: 4, ease: 'none', duration: 1 }, 0)
      .fromTo('[data-downpour]', { yPercent: -8 }, { yPercent: 8, ease: 'none', duration: 1 }, 0)
      .fromTo('[data-rain-kanji]', { yPercent: 45, opacity: 0 }, { yPercent: -35, opacity: 1, ease: 'none', duration: 1 }, 0)
      .fromTo('[data-rain-col]', { yPercent: -30, opacity: 0 }, { yPercent: 20, opacity: 1, ease: 'none', duration: 0.7 }, 0.3)
      .fromTo('.rain__copy .index', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.1 }, 0.38)
      .fromTo(hChars, { yPercent: 115, rotate: 6 }, { yPercent: 0, rotate: 0, stagger: 0.006, ease: 'power3.out', duration: 0.12 }, 0.42)
      .fromTo('.rain__copy .lede', { opacity: 0 }, { opacity: 1, duration: 0.06 }, 0.5)
      .fromTo(words, { opacity: 0.12, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0px)', stagger: 0.012, ease: 'none', duration: 0.05 }, 0.56)
      .fromTo('[data-rain-meta] li', { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.03, duration: 0.08 }, 0.84);

    // pointer leans the storm and slides the image a touch the other way
    if (finePointer) {
      const mx = gsap.quickTo(wrap, 'x', { duration: 1.2, ease: 'power3.out' });
      const my = gsap.quickTo(wrap, 'y', { duration: 1.2, ease: 'power3.out' });
      sec.addEventListener('pointermove', e => {
        const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
        mx(-nx * 34); my(-ny * 20);
        storm.setWind(0.16 + nx * 0.4);
      });
    }
  }

  /* =====================================================================
     03 · PRAISE — the words he saved for last, then crows
     ===================================================================== */
  const BOND_COUNT = 70;

  function initPraise() {
    if (reduced || !hasGsap) return;
    const sec = $('[data-praise]');
    const lines = $$('[data-line]');
    const bar = $('[data-praise-bar]');
    const kanji = $('[data-praise-kanji]');

    // scroll → frame: he speaks (0–41), the crows take him (–60), Sasuke alone (–69)
    const KEYS = [[0, 0], [0.56, 41], [0.78, 60], [0.92, 69], [1, 69]];
    const LINE_WINDOWS = [[0.03, 0.15], [0.17, 0.29], [0.31, 0.43], [0.45, 0.62], [0.82, 0.985]];

    const seq = createSequence({
      section: sec, stage: $('[data-praise-stage]'), canvas: $('[data-praise-canvas]'), count: BOND_COUNT,
      path: i => `media/bond/b_${String(i + 1).padStart(3, '0')}.webp`,
      keys: KEYS, focusX: 0.4,
      // the crows move too far between frames to blend without ghosting
      blend: f => f < 41,
      zoom: p => 1.08 - 0.08 * easeInOut(range(p, 0, 0.6)),
      onRender(p) {
        lines.forEach((el, i) => {
          const [a, b] = LINE_WINDOWS[i];
          const o = windowed(p, a, b, 0.025);
          const ink = easeOut(range(p, a, a + 0.05));
          el.style.opacity = o;
          el.style.transform = `translate3d(0,${(1 - range(p, a, a + 0.025)) * 30 - range(p, b - 0.025, b) * 30}px,0)`;
          el.style.setProperty('--ink', `${100 - ink * 100}%`);
        });
        bar.style.transform = `scaleX(${p})`;
        kanji.style.opacity = 0.9 * (1 - range(p, 0.5, 0.7));
        kanji.style.transform = `translate3d(0,${(0.5 - p) * 24}vh,0)`;
      },
    });
    // these load once the visitor is on the way down, so they never hold the preloader
    ScrollTrigger.create({ trigger: sec, start: 'top 400%', once: true, onEnter: () => seq.load() });
  }

  /* =====================================================================
     04 · BOND — the memory on paper
     ===================================================================== */
  function initBond() {
    if (reduced || !hasGsap) return;
    const art = $('[data-bond-art]');
    const figure = $('[data-bond-figure]');
    const kanji = $('[data-bond-kanji]');

    const enter = gsap.timeline({ scrollTrigger: { trigger: art, start: 'top 72%' } });
    enter.fromTo('[data-bond-sun]', { scale: 0 }, { scale: 1, duration: 1.6, ease: 'expo.out' })
      .fromTo(figure, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'power4.inOut' }, 0.15)
      .fromTo($('img', figure), { yPercent: 14, scale: 1.12 }, { yPercent: 0, scale: 1, duration: 1.7, ease: 'power3.out' }, 0.15)
      .fromTo(kanji, { opacity: 0, letterSpacing: '.5em' }, { opacity: 1, letterSpacing: '0em', duration: 1.6, ease: 'power3.out' }, 0.3)
      .fromTo('[data-bond-seal]', { scale: 2.4, opacity: 0, rotate: -24 }, { scale: 1, opacity: 1, rotate: -8, duration: 0.5, ease: 'power4.in' }, 1.2)
      .fromTo('.bond__art figcaption', { opacity: 0 }, { opacity: 1, duration: 1 }, 1.3);

    // layers at three speeds
    const sc = { trigger: art, start: 'top bottom', end: 'bottom top', scrub: 0.6 };
    gsap.fromTo(figure, { y: 70 }, { y: -70, ease: 'none', scrollTrigger: sc });
    gsap.fromTo(kanji, { yPercent: -28 }, { yPercent: 28, ease: 'none', scrollTrigger: sc });
    gsap.fromTo('[data-bond-sun]', { yPercent: 16 }, { yPercent: -16, ease: 'none', scrollTrigger: sc });

    if (finePointer) {
      const img = $('img', figure);
      const fx = gsap.quickTo(img, 'x', { duration: 1, ease: 'power3.out' });
      const kx = gsap.quickTo(kanji, 'x', { duration: 1.4, ease: 'power3.out' });
      art.addEventListener('pointermove', e => {
        const r = art.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        fx(nx * 22); kx(-nx * 40);
      });
      art.addEventListener('pointerleave', () => { fx(0); kx(0); });
    }
  }

  /* =====================================================================
     SCROLL REVEALS, PROGRESS
     ===================================================================== */
  function initReveals() {
    if (reduced || !hasGsap) return;

    $$('[data-split]').forEach(el => {
      if (el.closest('.hero')) return; // hero type handled by its own timeline
      const chars = splitText(el);
      gsap.from(chars, {
        yPercent: 115, rotate: 7, duration: 1.1, stagger: 0.018, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 86%' },
      });
    });

    $$('[data-reveal]').forEach(el => {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
      });
    });

    $$('[data-scroll-words]').forEach(el => {
      if (el.closest('[data-rain-sec]')) return; // driven by the rain timeline
      const words = splitWords(el);
      gsap.fromTo(words, { opacity: 0.12, filter: 'blur(5px)' }, {
        opacity: 1, filter: 'blur(0px)', stagger: 0.06, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 85%', end: 'bottom 45%', scrub: 0.6 },
      });
    });

    const bar = $('[data-progress]');
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: s => { bar.style.transform = `scaleX(${s.progress})`; },
    });
  }

  /* =====================================================================
     CURSOR, ANCHORS
     ===================================================================== */
  function initPointer() {
    FX.clickSpark($('[data-sparks]'));
    if (!finePointer || reduced || !hasGsap) return;
    const cur = $('[data-cursor]');
    const xTo = gsap.quickTo(cur, 'x', { duration: 0.18, ease: 'power3.out' });
    const yTo = gsap.quickTo(cur, 'y', { duration: 0.18, ease: 'power3.out' });
    addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); cur.classList.add('is-on'); }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
    document.addEventListener('pointerover', e => {
      cur.classList.toggle('is-hover', !!e.target.closest('a, button, .fall'));
    });
  }

  function initAnchors() {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      scrollToTarget(target);
    });

  }

  /* =====================================================================
     OUTRO — falling text
     ===================================================================== */
  function initOutro() {
    const box = $('[data-fall]');
    const btn = $('[data-fall-btn]');
    const ft = FX.fallingText(box, $('[data-fall-target]'), {
      hot: ['SASUKE', 'LOVE', 'ALWAYS'], soft: ['SORRY', 'MAYBE', 'NEXT', 'TIME'],
      // on touch screens, leave the box scrollable instead of draggable
      touchScroll: !finePointer,
    });
    const start = () => ft.start();
    btn.addEventListener('click', e => { e.stopPropagation(); start(); });
    box.addEventListener('click', start);
    if (reduced) btn.remove();
  }

  /* =====================================================================
     BOOT
     ===================================================================== */
  function boot() {
    document.body.classList.add('is-loading');
    initAnchors();
    initOutro();
    initPointer();
    initHero();

    preload().then(() => {
      initRain();
      initPraise();
      initBond();
      initReveals();
      if (hasGsap) {
        ScrollTrigger.refresh();
        // lazy images arriving later can still nudge layout: re-measure once they land
        let rt;
        const remeasure = () => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); };
        $$('img[loading="lazy"]').forEach(img => { if (!img.complete) img.addEventListener('load', remeasure, { once: true }); });
        addEventListener('load', remeasure);
      }
      dismissLoader();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
