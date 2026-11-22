# Changelog

## 1.1.0 — 2026-11-22

- New `custom:music-station` wrapper: Music Assistant pane + karaoke panel in one card.
- Auto-detects the Music Assistant add-on and manages the ingress session (refresh every 60s).
- Karaoke panel: album art, progress, transport, synced LRC lyrics from LRCLIB.
- Player picker with search; the chosen player is remembered per dashboard.
- Automatic fallback to a player that actually has lyrics; players that have no lyrics for the
  current track are skipped.
- Layout options: `side` (two columns) and `stack` (mobile), plus `height` / `karaoke_height`.
- Artwork uses the Home Assistant media proxy to avoid mixed-content issues with MA image URLs.

## 1.0.0 — 2026-11-22

- Initial release: karaoke now-playing card + Music Assistant iframe card.
