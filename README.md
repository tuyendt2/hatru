# Lời Ru

PWA for recording lullabies so the family can play them at bedtime.

- Recordings live only on the phone (IndexedDB). Nothing is uploaded.
- Share between phones: Chia sẻ → "Gửi tất cả bài hát" makes one `.loiru.json` file; the other phone imports it with "Nhận bài hát".
- `npm run serve` runs it locally; `npm run icons` regenerates icons; `npm run deploy` publishes `public/` to gh-pages.
- Bump `VERSION` in `public/sw.js` on each deploy.
