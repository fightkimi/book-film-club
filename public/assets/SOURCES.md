# Runtime artwork sources

## Tongpin identity

- `tongpin-frequency.svg`: original thin-line frequency symbol, authored as SVG for this product.
- `tongpin-wordmark.svg`: original AI-generated Chinese handwriting, converted into real SVG paths with VTracer. Text: 同频. Original generated raster retained outside runtime assets.

## Theme posters

The following are user-requested illustrative film posters, not app-owned film artwork. Rights remain with their respective owners. Association rationale and source links are in `src/posters.json`; files are locally served to avoid hotlink fragility. They are not included under any software component license.

- Cinema Paradiso: https://cdn.posteritati.com/posters/000/000/049/398/cinema-paradiso-md-web.jpg
- Rashomon: https://filmartgallery.com/cdn/shop/files/Rashomon-Vintage-Movie-Poster-Original_7f366650_5000x.jpg?v=1773893125
- The Truman Show: https://pastposters.com/cdn/shop/files/truman-show-cinema-one-sheet-movie-poster-_1.jpg?v=1746702024
- In the Mood for Love: https://filmartgallery.com/cdn/shop/files/In-the-Mood-For-Love-Vintage-Movie-Poster-Original.jpg?v=1738905863
- Her: https://miro.medium.com/1%2Ai8TpasMyy6rUR7MVtHpM3g.jpeg
- Lost in Translation: https://filmartgallery.com/cdn/shop/files/Lost-In-Translation-Vintage-Movie-Poster-Original_ab74d287.jpg?height=1024&v=1741317131&width=1024

Retrieved 2026-10-28. No member ratings, viewing history or metadata-service success is inferred from these illustrative assets.

## Mini-program entry artwork

- `miniprogram/assets/film/hirayama-reading-room.jpg` — portrait-format AI extension of the scene of Hirayama reading at home in *Perfect Days* (2023), based on the original still reproduced in [The Washington Post](https://www.washingtonpost.com/entertainment/movies/2024/02/14/perfect-days-wim-wenders-movie-review/).

Retrieved for the mini-program trial on 2026-11-04. The login background extends the room vertically for a phone screen. The activity frame retains its original framing. Source rights remain with their respective owners.

## Bookstore feature artwork — 2026-11-05

- `miniprogram/assets/film/bookshop.jpg`: *The Bookshop* (2017), the bookshop reading scene, from [Portugal's National Cinema Plan](https://pnc.gov.pt/praticas/livraria-novo-filme-na-plataforma). Used only for the empty followed-bookstores page.
- `miniprogram/assets/film/paterson.jpg`: *Paterson* (2016), writing on a bench, from [The GATE](https://www.thegate.ca/film/027763/review-paterson-starring-adam-driver/). Used above the recommendation form with the subject's head and notebook retained.
- `miniprogram/assets/film/sisters.jpg`: *Our Little Sister* (2015), sisters at the table, [Sony Pictures Classics gallery image 2](https://www.sonyclassics.com/ourlittlesister/img/gallery/2.jpg). Used only after publishing an invitation.

These are the real scene images selected in the local design review, not fabricated bookstore photos. Source attribution is retained here; public redistribution rights have not been independently established.

## Mini-program animation size — 2026-11-06

`miniprogram/assets/motion/club-table.gif` was reduced from 231,242 to 137,783 bytes to keep the total packaged media within WeChat's 200 KB recommendation. Gifsicle 1.98 (`-O3 --careful --resize-width 296 --resize-method mix`) resampled the existing 360 × 218 animation to 296 × 179; this is not lossless. All 60 frames, their 100 ms delays, and the absence of a loop extension are retained. The displayed size and once-per-session playback code are unchanged; white-background comparisons were checked at the rendered size.

Gifsicle is a build-time tool only, not a bundled dependency. Its official source and options are at https://www.lcdf.org/gifsicle/ and https://www.lcdf.org/gifsicle/man.html. The original input is recoverable from Git commit `3911454404a394112f7a2dd3d0937195e7d984b8`.
