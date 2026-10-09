# Changelog

## [0.4.0](https://github.com/andrewtryder/snhu-tools/compare/v0.3.0...v0.4.0) (2026-10-09)


### Features

* serve public catalog from static snapshots ([#27](https://github.com/andrewtryder/snhu-tools/issues/27)) ([62da670](https://github.com/andrewtryder/snhu-tools/commit/62da67007d2875050735b08966724e7954502236))
* **snapshots:** implement secure weekly snapshot update PR workflow ([#33](https://github.com/andrewtryder/snhu-tools/issues/33)) ([f2e5416](https://github.com/andrewtryder/snhu-tools/commit/f2e54165e20fd7d90addaded47d68aff4948ddcc))


### Bug Fixes

* **security:** sanitize URL check in indexNow test to resolve CodeQL alert ([4a9bf68](https://github.com/andrewtryder/snhu-tools/commit/4a9bf68abead9b2ec85267aee6af42ba82c0e650))
* **snapshots:** schedule-aware freshness and quiescence validation ([#35](https://github.com/andrewtryder/snhu-tools/issues/35)) ([ab1cf08](https://github.com/andrewtryder/snhu-tools/commit/ab1cf08272442b74174f0e23eeabc0f88d634db9))
* **snapshots:** validate weekly sync provenance and quiescence ([#34](https://github.com/andrewtryder/snhu-tools/issues/34)) ([7185f5d](https://github.com/andrewtryder/snhu-tools/commit/7185f5d523578f4e9e25c14caf803dbd678f7900))
* **workflow:** skip redundant build checks on no-change and isolate test env ([#36](https://github.com/andrewtryder/snhu-tools/issues/36)) ([590cfb0](https://github.com/andrewtryder/snhu-tools/commit/590cfb0e70c8b0ab8169207946b30737687afb9d))


### Performance Improvements

* reduce Neon compute wakeups ([#20](https://github.com/andrewtryder/snhu-tools/issues/20)) ([1b304ad](https://github.com/andrewtryder/snhu-tools/commit/1b304ad62e7583e033597678d634cc3beecb310e))

## [0.3.0](https://github.com/andrewtryder/snhu-tools/compare/v0.2.0...v0.3.0) (2026-09-14)


### Features

* **analytics:** enable Vercel Speed Insights ([f04a817](https://github.com/andrewtryder/snhu-tools/commit/f04a8170aa7c87e136e1e173388e0a774a7a3ecb))


### Performance Improvements

* **cache:** convert public read-heavy pages to static and ISR routes ([#7](https://github.com/andrewtryder/snhu-tools/issues/7)) ([0858072](https://github.com/andrewtryder/snhu-tools/commit/085807292803e87bd7d5f789b9e3063407ab7a3e))
* remove unnecessary site-wide proxy ([e4c8cb4](https://github.com/andrewtryder/snhu-tools/commit/e4c8cb46ba30ddaaaa2e5061cfc96e0e4f4c981d))

## [0.2.0](https://github.com/andrewtryder/snhu-tools/compare/v0.1.0...v0.2.0) (2026-09-03)


### Features

* **seo:** add Google site verification to root metadata ([e63bedb](https://github.com/andrewtryder/snhu-tools/commit/e63bedb44e1c9ff909208a2cc4f205353c810170))
* **seo:** support prefixed and raw Google site verification tokens ([d7f96b0](https://github.com/andrewtryder/snhu-tools/commit/d7f96b0e956b863efbda62df9589699acb72ae15))
