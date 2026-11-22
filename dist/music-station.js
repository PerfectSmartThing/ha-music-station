/*
 * music-station — a Home Assistant Lovelace card that puts the Music Assistant
 * web UI and the karaoke "now playing" panel side by side.
 *
 * It is a thin wrapper: it resolves the Music Assistant add-on ingress URL
 * (same trick as the community addon-iframe-card), embeds it in an iframe and
 * renders <karaoke-now-playing> next to it.
 *
 * Requires: karaoke-now-playing.js (same folder) loaded as a Lovelace resource.
 *
 * Config:
 *   type: custom:music-station
 *   addon: d5369777_music_assistant     # Music Assistant add-on slug
 *   entities:                           # ordered player priority for lyrics
 *     - media_player.living_room
 *   side: 38                            # width of the lyrics column (%)
 *   language: th
 *   show_transport: true
 *   show_player_picker: true
 *   hide_music_assistant: false         # true = lyrics panel only
 */
(function () {
  "use strict";

  const STYLE = `
    :host { display:block; height:100%; }
    .grid { display:grid; height:100%; gap:12px; grid-template-columns:minmax(0,1fr) var(--side,38%); }
    .pane { min-width:0; min-height:0; border-radius:26px; overflow:hidden; background:#0b0f17; }
    .pane iframe { width:100%; height:100%; border:0; display:block; background:#0b0f17; }
    .grid.stack { grid-template-columns:1fr; grid-template-rows:minmax(0,1fr) var(--karaoke-h, 260px); }
    .grid.solo { grid-template-columns:1fr; }
    .msg { display:grid; place-items:center; height:100%; color:rgba(255,255,255,.55);
      font:14px/1.6 system-ui, sans-serif; text-align:center; padding:24px; }
    @media (max-width: 720px) {
      .grid { grid-template-columns:1fr; grid-template-rows:minmax(0,1fr) auto; }
    }
  `;

  class MusicStation extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = null;
      this._hass = null;
      this._sessionTimer = null;
      this._session = "";
      this._built = false;
    }

    setConfig(config) {
      this._config = Object.assign(
        {
          addon: null, side: 38, language: "th", hide_music_assistant: false,
          layout: "side", karaoke_height: 260, height: null,
          hide_ma_player_bar: true,
          hide_ma_bottom_nav: false,
          compact: false,
        },
        config || {}
      );
      this._built = false;
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) { this._built = true; this._render(); }
      const kara = this.shadowRoot.querySelector("karaoke-now-playing");
      if (kara) kara.hass = hass;
    }

    connectedCallback() { if (this._config) this._render(); }

    disconnectedCallback() {
      if (this._sessionTimer) { clearInterval(this._sessionTimer); this._sessionTimer = null; }
    }

    _render() {
      if (!this._hass || !this._config) return;
      if (this._config.height) this.style.height = this._config.height;
      const side = Number(this._config.side) || 38;
      const showMa = !this._config.hide_music_assistant;
      const stacked = this._config.layout === "stack";
      const kh = Number(this._config.karaoke_height) || 260;
      this.shadowRoot.innerHTML = `
        <style>${STYLE}</style>
        <div class="grid${stacked ? " stack" : ""}${showMa ? "" : " solo"}" style="--side:${side}%; --karaoke-h:${kh}px">
          ${showMa ? `<div class="pane" id="ma"><div class="msg">กำลังเชื่อมต่อ Music Assistant…</div></div>` : ""}
          <div class="pane" id="kara"></div>
        </div>`;

      this._mountKaraoke();

      if (showMa) this._mountMusicAssistant();
    }

    _mountKaraoke() {
      const host = this.shadowRoot.getElementById("kara");
      if (!host) return;
      const make = () => {
        if (!this._config || !host.isConnected) return;
        const kara = document.createElement("karaoke-now-playing");
        kara.setConfig({
          entities: this._config.entities || this._config.entity,
          entity: this._config.entity,
          language: this._config.language,
          show_transport: this._config.show_transport !== false,
          show_player_switch: this._config.show_player_picker !== false,
          show_volume: this._config.show_volume !== false,
          compact: this._config.compact === true,
          prefer_lyrics: this._config.prefer_lyrics !== false,
        });
        kara.hass = this._hass;
        host.innerHTML = "";
        host.appendChild(kara);
      };
      if (customElements.get("karaoke-now-playing")) make();
      else customElements.whenDefined("karaoke-now-playing").then(make);
    }

    async _mountMusicAssistant() {
      const host = this.shadowRoot.getElementById("ma");
      if (!host) return;
      try {
        const slug = this._config.addon || await this._findAddon();
        if (!slug) throw new Error("not running on Home Assistant OS, or Music Assistant add-on not found");
        const info = await this._hass.callWS({
          type: "supervisor/api",
          endpoint: `/addons/${slug}/info`,
          method: "get",
        });
        if (!info || !info.ingress_url) throw new Error("add-on has no ingress");
        await this._ensureSession();
        const frame = document.createElement("iframe");
        frame.src = info.ingress_url;
        frame.title = "Music Assistant";
        frame.allow = "autoplay; fullscreen";
        frame.addEventListener("load", () => this._decorateIframe(frame));
        host.innerHTML = "";
        host.appendChild(frame);
        if (!this._sessionTimer) {
          this._sessionTimer = setInterval(() => this._refreshSession(), 60000);
        }
      } catch (err) {
        host.innerHTML = `<div class="msg">เปิด Music Assistant ไม่ได้<br><small>${String(err && err.message || err)}</small></div>`;
      }
    }

    _decorateIframe(frame) {
      if (this._config.hide_ma_player_bar === false) return;
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.head || doc.getElementById("ms-hide-player-bar")) return;
        const style = doc.createElement("style");
        style.id = "ms-hide-player-bar";
        const rules = [
          "footer.mediacontrols-player-float,",
          "footer.mediacontrols-player-default,",
          ".mediacontrols-mobile-container,",
          ".mediacontrols-bg,",
          ".mediacontrols-mobile,",
          ".player-bar, .now-playing-bar { display:none !important; }",
        ];
        if (this._config.hide_ma_bottom_nav) {
          rules.push("nav.mobile-bottom-navigation { display:none !important; }");
        }
        style.textContent = rules.join(" ");
        doc.head.appendChild(style);
      } catch (e) { /* cross-origin or not ready */ }
    }

    async _findAddon() {
      try {
        const res = await this._hass.callWS({ type: "supervisor/api", endpoint: "/addons", method: "get" });
        const addons = (res && res.addons) || res || [];
        const ma = addons.find((a) => /music\s*assistant/i.test(a.name || ""))
          || addons.find((a) => /music_assistant/.test(a.slug || ""));
        return ma ? ma.slug : null;
      } catch (e) { return null; }
    }

    async _ensureSession() {
      const res = await this._hass.callWS({
        type: "supervisor/api",
        endpoint: "/ingress/session",
        method: "post",
      });
      this._session = res.session;
      this._setCookie(this._session);
    }

    async _refreshSession() {
      try {
        await this._hass.callWS({
          type: "supervisor/api",
          endpoint: "/ingress/validate_session",
          method: "post",
          data: { session: this._session },
        });
        this._setCookie(this._session);
      } catch (e) {
        try { await this._ensureSession(); } catch (e2) { /* ignore */ }
      }
    }

    _setCookie(session) {
      document.cookie = "ingress_session=" + session + ";path=/api/hassio_ingress/;SameSite=Strict"
        + (location.protocol === "https:" ? ";Secure" : "");
    }

    getCardSize() { return 10; }

    static getStubConfig() {
      return {
        addon: "d5369777_music_assistant",
        entities: ["media_player.living_room"],
        side: 38,
      };
    }
  }

  if (!customElements.get("music-station")) customElements.define("music-station", MusicStation);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "music-station",
    name: "Music Station",
    description: "Music Assistant web UI + karaoke now-playing panel.",
    preview: true,
  });
})();
