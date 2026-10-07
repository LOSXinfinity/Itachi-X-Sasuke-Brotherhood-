# 兄弟 — Itachi & Sasuke

A scroll-told tribute to the Uchiha brothers. Four chapters — the touch, the rain, the praise, the bond — told through frame-perfect image sequences, glyph rain, and falling-word physics.

## Live Demo

Open `index.html` directly or run locally:

```bash
npm run serve
# → http://localhost:5174
```

## Features

- **Chapter 1 — The Touch**: 70-frame scroll-scrubbed sequence (hand reaches → forehead poke → white-out → childhood memory)
- **Chapter 2 — Rain**: Parallax doors reveal Itachi in the storm; multi-layer glyph downpour leans with pointer/scroll
- **Chapter 3 — Praise**: Second 70-frame sequence; Itachi's final words appear line-by-line, then crows carry him away
- **Chapter 4 — Bond**: Paper-textured memory of young Itachi carrying Sasuke; tap to scatter words with Matter.js physics
- **Sharingan cursor** with rotating tomoe ring (desktop, reduced-motion aware)
- **Bilingual JP/EN typography**: Fraunces (voice), Kaisei Tokumin (kanji), Space Grotesk / Zen Kaku Gothic (UI)
- **Full `prefers-reduced-motion` support** — static fallbacks for all sequences
- **Zero framework** — vanilla HTML/CSS/JS, ~2KB gzipped JS (vendor libs: GSAP, ScrollTrigger, Lenis, Matter.js)

## Tech Stack

| Layer | Tools |
|-------|-------|
| Animation | GSAP + ScrollTrigger |
| Smooth scroll | Lenis |
| Physics | Matter.js |
| Images | WebP sequences (1280×720) |
| Fonts | Google Fonts (Fraunces, Kaisei Tokumin, Space Grotesk, Zen Kaku Gothic New) |
| Build | None — static files only |

## Project Structure

```
.
├── index.html          # Main HTML document
├── css/
│   └── styles.css      # All styles (CSS custom properties, no preprocessor)
├── js/
│   ├── app.js          # Section initialization, scroll orchestration
│   └── fx.js           # Reusable effects (split text, glyph rain, downpour, falling text, click sparks)
├── vendor/             # Minified libs (GSAP, ScrollTrigger, Lenis, Matter.js)
├── media/
│   ├── hero/           # 70 frames (f_001–f_070.webp)
│   ├── bond/           # 70 frames (b_001–b_070.webp)
│   └── art/            # Key art (rain.webp, brothers.webp)
└── package.json        # npm serve script only
```

## Accessibility

- Semantic HTML5, ARIA labels on decorative canvases
- `prefers-reduced-motion` disables all motion, shows static fallbacks
- `prefers-color-scheme` not used (dark-only artistic direction)
- Focus-visible outlines, keyboard-navigable anchor links
- All Japanese text has `lang="ja"` attributes

## License

Fan-made tribute. Naruto and its characters belong to Masashi Kishimoto. Not affiliated.

Code: MIT License — feel free to learn from or adapt the animation techniques.
