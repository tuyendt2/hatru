# Lời Ru

PWA for recording lullabies so the family can play them at bedtime. No build step: the app files sit at the repo root; GitHub Pages serves the `gh-pages` branch.

- Recordings live only on the phone (IndexedDB). Nothing is uploaded.
- Share between phones: Chia sẻ → "Gửi tất cả bài hát" makes one `.loiru.json` file; the other phone imports it with "Nhận bài hát".
- `npm run serve` runs it locally; `npm run icons` regenerates icons.
- Deploy: push `main`, then `npm run deploy`. Bump `VERSION` in `sw.js` each time.
