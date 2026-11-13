# Lời Ru

PWA for recording lullabies so the family can play them at bedtime. Served by GitHub Pages straight from the root of `main` (no build step).

- Recordings live only on the phone (IndexedDB). Nothing is uploaded.
- Share between phones: Chia sẻ → "Gửi tất cả bài hát" makes one `.loiru.json` file; the other phone imports it with "Nhận bài hát".
- `npm run serve` runs it locally; `npm run icons` regenerates icons.
- Deploy = commit + push to `main`. Bump `VERSION` in `sw.js` each time.
