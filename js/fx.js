/* =========================================================================
   fx.js — reusable effects. Vanilla ports of React Bits components
   (SplitText, DecryptedText, ScrollReveal, ScrollVelocity, FallingText,
   ClickSpark) plus the site's own falling glyphs.
   Each factory returns an object with at least { destroy() }.
   ========================================================================= */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const KANJI = '兄弟絆額雨烏誇愛許記憶写輪眼月読暁里影忍一族真実涙';

  // Run a callback only while an element is on screen.
  function whileVisible(el, onChange, margin = '100px') {
    const io = new IntersectionObserver(([e]) => onChange(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }

  /* ---------------------------------------------------------------------
     SplitText — words/chars wrapped for staggered reveals.
     --------------------------------------------------------------------- */
  function splitText(el) {
    if (el.dataset.splitDone) return el.querySelectorAll('.split-char');
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const line = document.createElement('span');
    line.className = 'split-line';
    line.setAttribute('aria-hidden', 'true');
    text.split(/\s+/).forEach((word, wi, arr) => {
      const w = document.createElement('span');
      w.className = 'split-word';
      [...word].forEach(ch => {
        const c = document.createElement('span');
        c.className = 'split-char';
        c.textContent = ch;
        w.appendChild(c);
      });
      line.appendChild(w);
      if (wi < arr.length - 1) line.appendChild(document.createTextNode(' '));
    });
    el.appendChild(line);
    el.dataset.splitDone = '1';
    return el.querySelectorAll('.split-char');
  }

  /* ---------------------------------------------------------------------
     ScrollReveal — words wrapped so they can un-blur one by one on scroll.
     --------------------------------------------------------------------- */
  function splitWords(el) {
    if (el.dataset.wordsDone) return el.querySelectorAll('.sr-word');
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.innerHTML = text.split(/\s+/).map(w => `<span class="sr-word" aria-hidden="true">${w}</span>`).join(' ');
    el.dataset.wordsDone = '1';
    return el.querySelectorAll('.sr-word');
  }

  /* ---------------------------------------------------------------------
     DecryptedText — scramble to the final string.
     --------------------------------------------------------------------- */
  function decrypt(el, { speed = 34, chars = KATAKANA + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', sequential = true } = {}) {
    const final = el.dataset.final || el.textContent;
    el.dataset.final = final;
    clearInterval(el._decrypt);
    let revealed = 0;
    let iter = 0;
    el._decrypt = setInterval(() => {
      let out = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        if (ch === ' ' || ch === ',' || i < revealed) out += ch;
        else out += chars[(Math.random() * chars.length) | 0];
      }
      el.textContent = out;
      if (sequential) revealed++;
      else if (++iter > 12) revealed = final.length;
      if (revealed > final.length) {
        clearInterval(el._decrypt);
        el.textContent = final;
      }
    }, speed);
  }

  /* ---------------------------------------------------------------------
     ScrollVelocity — marquee rows whose speed and direction follow scroll.
     velocityRef() should return current scroll velocity (px/frame-ish).
     --------------------------------------------------------------------- */
  function scrollVelocity(root, { baseVelocity = 60, velocityRef }) {
    const rows = [...root.querySelectorAll('[data-velo-row]')].map(row => {
      const span = row.firstElementChild;
      // enough copies to cover wide screens twice
      const copies = Math.max(3, Math.ceil((window.innerWidth * 2) / Math.max(1, span.offsetWidth)) + 1);
      for (let i = 1; i < copies; i++) row.appendChild(span.cloneNode(true));
      return { row, span, dir: Number(row.dataset.veloRow) || 1, x: 0, width: span.offsetWidth };
    });
    let smooth = 0, raf = 0, last = performance.now(), running = false;
    const onResize = () => rows.forEach(r => (r.width = r.span.offsetWidth));
    window.addEventListener('resize', onResize);

    function tick(now) {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const v = velocityRef ? velocityRef() : 0;
      smooth += (v - smooth) * 0.12;
      const factor = clamp(smooth / 6, -6, 6);
      rows.forEach(r => {
        const dirSign = factor < 0 ? -1 : 1;
        const move = r.dir * baseVelocity * dt * dirSign * (1 + Math.abs(factor));
        r.x -= move;
        if (r.width) r.x = ((r.x % r.width) - r.width) % r.width; // wrap into (-w, 0]
        r.row.style.transform = `translate3d(${r.x}px,0,0)`;
      });
      raf = requestAnimationFrame(tick);
    }
    const stopVis = whileVisible(root, vis => {
      if (vis && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
      else if (!vis && running) { running = false; cancelAnimationFrame(raf); }
    });
    return { destroy() { stopVis(); cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); } };
  }

  /* ---------------------------------------------------------------------
     GlyphRain — falling katakana/kanji columns on a transparent canvas,
     so it can sit over the frame sequence. setRed(0..1) turns more of the columns gold.
     --------------------------------------------------------------------- */
  function glyphRain(canvas) {
    const ctx = canvas.getContext('2d');
    const glyphs = [...(KATAKANA + KANJI)];
    let w = 0, h = 0, size = 18, cols = [], raf = 0, last = 0, running = false;
    let red = 0; // 0..1
    const mouse = { x: -999, y: -999 };

    function resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = w < 700 ? 14 : 18;
      const n = Math.ceil(w / size);
      cols = Array.from({ length: n }, () => ({
        y: Math.random() * -h,
        speed: 0.3 + Math.random() * 0.8,
        on: Math.random() < 0.36,
      }));
    }
    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (now - last < 42) return; // ~24fps: reads as stepped, cinematic
      last = now;
      // fade what's there instead of painting a backdrop, so the canvas stays see-through
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `700 ${size}px "Kaisei Tokumin", serif`;
      ctx.textAlign = 'center';
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c.on) continue;
        const x = i * size + size / 2;
        const g = glyphs[(Math.random() * glyphs.length) | 0];
        const near = Math.hypot(mouse.x - x, mouse.y - c.y) < 140;
        const isRed = (i * 7919) % 100 < 12 + red * 60;
        ctx.fillStyle = near ? '#ffffff' : isRed ? 'rgba(226,183,94,.95)' : 'rgba(228,233,242,.8)';
        ctx.fillText(g, x, c.y);
        c.y += size * c.speed;
        if (c.y > h + size * 4) {
          c.y = Math.random() * -h * 0.5;
          c.on = Math.random() < 0.4;
          c.speed = 0.3 + Math.random() * 0.8;
        }
      }
    }
    resize();
    const onMove = e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    const stopVis = whileVisible(canvas, vis => {
      if (vis && !running) { running = true; raf = requestAnimationFrame(tick); }
      else if (!vis && running) { running = false; cancelAnimationFrame(raf); }
    }, '0px');
    return {
      setRed(v) { red = clamp(v, 0, 1); },
      destroy() { stopVis(); cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); },
    };
  }

  /* ---------------------------------------------------------------------
     Downpour — rain where every drop is a glyph dragging a streak.
     Three depth layers fall at different speeds for parallax;
     setWind() leans the whole storm with the pointer or scroll.
     --------------------------------------------------------------------- */
  function downpour(canvas, { density = 1 } = {}) {
    const ctx = canvas.getContext('2d');
    const glyphs = [...(KATAKANA + KANJI)];
    let w = 0, h = 0, raf = 0, running = false, drops = [], last = 0, wind = 0.16, windTo = 0.16;
    const make = (y) => {
      const z = Math.random(); // 0 far … 1 near
      return {
        x: Math.random() * (w + 300) - 150,
        y: y ?? Math.random() * h,
        z,
        v: 520 + z * 900 + Math.random() * 200,
        size: 9 + z * 11,
        len: 30 + z * 90,
        g: glyphs[(Math.random() * glyphs.length) | 0],
        red: Math.random() < 0.07,
      };
    };
    function resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.round((w < 700 ? 60 : 150) * density) }, () => make());
    }
    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      wind += (windTo - wind) * 0.05;
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.lineCap = 'round';
      for (const d of drops) {
        d.y += d.v * dt;
        d.x += d.v * dt * wind;
        if (d.y - d.len > h) Object.assign(d, make(-20 - Math.random() * 120));
        const a = 0.12 + d.z * 0.5;
        const col = d.red ? '226,183,94' : '225,228,238';
        const tx = d.x - d.len * wind, ty = d.y - d.len;
        const grad = ctx.createLinearGradient(tx, ty, d.x, d.y);
        grad.addColorStop(0, `rgba(${col},0)`);
        grad.addColorStop(1, `rgba(${col},${a * 0.7})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.6 + d.z * 0.9;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(d.x, d.y - d.size * 0.9); ctx.stroke();
        ctx.font = `700 ${d.size}px "Kaisei Tokumin", serif`;
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.fillText(d.g, d.x, d.y);
      }
    }
    resize();
    window.addEventListener('resize', resize);
    const stopVis = whileVisible(canvas, vis => {
      if (vis && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
      else if (!vis && running) { running = false; cancelAnimationFrame(raf); }
    });
    return {
      setWind(v) { windTo = clamp(v, -0.5, 0.5); },
      destroy() { stopVis(); cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
    };
  }

  /* ---------------------------------------------------------------------
     FallingText — words drop with matter.js physics and can be thrown.
     --------------------------------------------------------------------- */
  function fallingText(container, target, { hot = [], soft = [], gravity = 1.1, touchScroll = false } = {}) {
    const words = target.textContent.trim().split(/\s+/);
    target.setAttribute('aria-label', target.textContent.trim());
    target.innerHTML = words.map(w => {
      const bare = w.replace(/[.,]/g, '').toUpperCase();
      const jp = /[^\x00-\x7F]/.test(w);
      const cls = (hot.includes(bare) ? ' fw--hot' : soft.includes(bare) ? ' fw--soft' : '') + (jp ? ' fw--jp' : '');
      return `<span class="fw${cls}" aria-hidden="true"${jp ? ' lang="ja"' : ''}>${w}</span>`;
    }).join(' ');

    let cleanup = null;
    function start() {
      if (cleanup || !window.Matter) return;
      const { Engine, World, Bodies, Body, Mouse, MouseConstraint } = Matter;
      const cr = container.getBoundingClientRect();
      const W = cr.width, H = cr.height;
      const engine = Engine.create();
      engine.world.gravity.y = gravity;
      const wall = { isStatic: true };
      const bounds = [
        Bodies.rectangle(W / 2, H + 40, W * 2, 80, wall),
        Bodies.rectangle(-40, H / 2, 80, H * 3, wall),
        Bodies.rectangle(W + 40, H / 2, 80, H * 3, wall),
        Bodies.rectangle(W / 2, -600, W * 2, 80, wall),
      ];
      const spans = [...target.querySelectorAll('.fw')];
      const items = spans.map(el => {
        const r = el.getBoundingClientRect();
        const body = Bodies.rectangle(r.left - cr.left + r.width / 2, r.top - cr.top + r.height / 2, r.width, r.height * 0.8, {
          restitution: 0.5, frictionAir: 0.014, friction: 0.25, chamfer: { radius: 6 },
        });
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 6, y: -Math.random() * 4 });
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
        return { el, body, w: r.width, h: r.height };
      });
      items.forEach(({ el }) => {
        el.style.position = 'absolute';
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.margin = '0';
        el.style.willChange = 'transform';
      });
      target.style.padding = '0';
      const mouse = Mouse.create(container);
      // let the page keep scrolling over the box
      mouse.element.removeEventListener('mousewheel', mouse.mousewheel);
      mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel);
      mouse.element.removeEventListener('wheel', mouse.mousewheel);
      if (touchScroll) {
        mouse.element.removeEventListener('touchmove', mouse.mousemove);
        mouse.element.removeEventListener('touchstart', mouse.mousedown);
        mouse.element.removeEventListener('touchend', mouse.mouseup);
      }
      const mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
      World.add(engine.world, [...bounds, mc, ...items.map(i => i.body)]);
      let raf, last = performance.now();
      const loop = now => {
        Engine.update(engine, Math.min(32, now - last));
        last = now;
        for (const { el, body, w, h } of items) {
          el.style.transform = `translate(${body.position.x - w / 2}px,${body.position.y - h / 2}px) rotate(${body.angle}rad)`;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      container.classList.add('is-falling');
      cleanup = () => { cancelAnimationFrame(raf); World.clear(engine.world); Engine.clear(engine); };
    }
    return { start, destroy() { cleanup && cleanup(); } };
  }

  /* ---------------------------------------------------------------------
     ClickSpark — radial sparks on every click.
     --------------------------------------------------------------------- */
  function clickSpark(canvas, { colors = ['#e2b75e', '#e4e9f2', '#7f8fc4'], count = 10, radius = 26 } = {}) {
    const ctx = canvas.getContext('2d');
    let sparks = [], raf = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const loop = now => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      sparks = sparks.filter(s => {
        const t = (now - s.t0) / 420;
        if (t >= 1) return false;
        const e = 1 - Math.pow(1 - t, 3);
        const d = e * radius, len = 12 * (1 - e);
        ctx.strokeStyle = s.c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x + d * Math.cos(s.a), s.y + d * Math.sin(s.a));
        ctx.lineTo(s.x + (d + len) * Math.cos(s.a), s.y + (d + len) * Math.sin(s.a));
        ctx.stroke();
        return true;
      });
      raf = sparks.length ? requestAnimationFrame(loop) : 0;
    };
    const onClick = e => {
      const t0 = performance.now();
      for (let i = 0; i < count; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, a: (Math.PI * 2 * i) / count, t0, c: colors[i % colors.length] });
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('click', onClick);
    return { destroy() { window.removeEventListener('resize', resize); window.removeEventListener('click', onClick); } };
  }

  window.FX = { clamp, splitText, splitWords, decrypt, scrollVelocity, glyphRain, downpour, fallingText, clickSpark, whileVisible };
})();
