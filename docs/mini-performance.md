# Mini-program performance pass · 1.8.1

Scope: all 45 declared routes were inspected through their shared loaders, image sources, lifecycle and component dependencies. This is a code-level inventory, not a claim that every device and route was profiled at 60 fps.

| Routes | Shared bottleneck and change |
| --- | --- |
| 27 club/catalog pages | Retain existing native views, avoid rebuilding a fresh catalog on a short return, resolve device/platform once per client. |
| 7 personal pages | Remove hide-time content teardown; reuse short session reads; fetch item and notes concurrently; append only the next list page. |
| 9 bookstore pages and the invitation detail | Keep content mounted across native navigation; preserve city/district selection; invalidate old callbacks and clear data when identity changes. |
| Login | Retain the existing scene; cancel delayed share-card work when leaving. |

The original once-per-session activity illustration is unchanged. Native WeChat transitions remain in use. Share-card canvas work begins 450 ms after loading, is cancelled when hidden, and can still run immediately when the reader explicitly shares. Option pickers, month pickers and WeUI cells are declared locally; five global declarations were removed, including one unused component.

## Image delivery

32 existing bookstore photographs have 640-pixel list and 960-pixel detail variants in `public/assets/bookstores/v181/`. `manifest.json` records original URLs, sizes and variant dimensions. Hashed filenames use the existing `/mini-assets/v161/bookstores/v181/` static route and its 30-day cache. Original photos remain available through preview; thumbnail errors fall back to the source. No open-ended image proxy was added.

Original total: 7,941,894 bytes. List variants: 1,783,169 bytes (77.5% smaller). Detail variants: 2,916,874 bytes (63.3% smaller). These are totals for all photos, not a claim that one page downloads every photo. Packaged image/audio assets remain at 196,891 bytes; the new photos are remote assets.

On 2026-11-06, the Bananafish source image transferred 441,886 bytes in 2.211 s / 1.666 s in two local probes. Its list variant transferred 40,819 bytes in 0.293 s / 0.244 s / 0.283 s after deployment. The measurements are network-dependent samples, not device-wide percentile guarantees. Sample TMDB misses took 1.273–1.983 s; subsequent cache hits took 0.239–0.255 s. Lists now also resize already-proxied TMDB `w500` URLs to `w342`.

## Session and freshness constraints

Opt-in read views use a bounded (40 entries), 30-second memory cache. Concurrent reads are deduplicated; failed reads are evicted. Writes clear it both when starting and completing, preventing a read during a write from surviving after the mutation. Logout/401/account changes clear the cache and mounted page data. Late callbacks cannot update a page from another session. Sensitive credentials are still cleared on leaving the connection form. All writes continue to validate permissions and revisions on the server. Pull-to-refresh bypasses these reads.

## Text input

The reflection field separates its outer border/padding from the native textarea. Text and placeholder both use 17 px type with a 28 px line height. No positional transform is applied to the caret. This follows the outer-wrapper approach used by [Tencent TDesign's textarea](https://github.com/Tencent/tdesign-miniprogram/tree/develop/packages/components/textarea), without adding a dependency or copying component code. The reported Android native-caret issue still needs confirmation on that phone; the desktop simulator can verify layout and editing but cannot reproduce every native input implementation.

## Verification

Regression coverage includes request deduplication, failure retry, write/read races, account changes, stale callbacks, preserved drafts, deferred/cancelled share rendering, native module resolution and local component declarations. Existing member/login/permission, media-budget, movie catalog, event and review checks remain required. Native testing must cover the four tabs, catalog/detail/back, a reflection draft round trip, bookstore filters/photos, pickers, share preview and logout before upload. No main-service restart or database migration is needed for this release.
