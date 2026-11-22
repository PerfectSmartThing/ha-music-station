/*
 * karaoke-now-playing — a Home Assistant Lovelace card.
 *
 * Big artwork + progress + synced (LRC) lyrics that follow the track,
 * with a soft karaoke style highlight.  Lyrics come from LRCLIB
 * (https://lrclib.net) which is free and has Thai tracks.
 *
 * Written as a classic script on purpose: Lovelace resources of type
 * "js" do not need CORS, so the file can be hosted on any static host.
 *
 * Config:
 *   type: custom:karaoke-now-playing
 *   entity: media_player.homepod_h_ngkhraw      # required
 *   language: th                                # label language (th|en)
 *   show_transport: true                        # prev / play / next buttons
 *   accent: "#7dd3fc"                           # highlight colour
 */
(function () {
  "use strict";

  const LRC_TIME = /\[(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)\]/g;

  function parseLrc(text) {
    const out = [];
    if (!text) return out;
    text.split(/\r?\n/).forEach((raw) => {
      let line = raw;
      const times = [];
      let m;
      LRC_TIME.lastIndex = 0;
      while ((m = LRC_TIME.exec(line)) !== null) {
        const min = parseInt(m[1], 10);
        const sec = parseFloat(String(m[2]).replace(":", "."));
        if (!Number.isNaN(min) && !Number.isNaN(sec)) times.push(min * 60 + sec);
      }
      const body = line.replace(LRC_TIME, "").trim();
      times.forEach((t) => out.push({ t, text: body }));
    });
    out.sort((a, b) => a.t - b.t);
    // drop empty duplicates produced by multi-timestamp lines
    return out.filter((l, i) => l.text || i === 0 || out[i - 1].text);
  }

  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  const STYLE = `
    :host { display:block; height:100%; container-type:inline-size; }
    * { box-sizing:border-box; }
    [hidden] { display:none !important; }
    ha-card { height:100%; overflow:hidden; border-radius:26px; position:relative;
      background:var(--card-background-color,#0b0f17); border:1px solid rgba(255,255,255,.075);
      box-shadow:0 24px 60px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.06) inset; }
    .wrap { position:relative; height:100%; display:flex; flex-direction:column; padding:18px 18px 14px; gap:12px; }
    .bg { position:absolute; inset:-40px; background-size:cover; background-position:center;
      filter:blur(42px) saturate(1.4) brightness(.5); transform:scale(1.2); opacity:.9; z-index:0; }
    .veil { position:absolute; inset:0; z-index:1;
      background:radial-gradient(130% 90% at 50% 0%, rgba(10,14,22,.30), rgba(7,10,16,.88) 58%, rgba(4,6,11,.97)); }
    .inner { position:relative; z-index:2; display:flex; flex-direction:column; height:100%; gap:12px; min-height:0; }

    .top { display:flex; gap:14px; align-items:center; }
    ha-card.compact .top { display:none; }
    ha-card.compact .wrap { padding-top:14px; }
    .art { width:132px; height:132px; flex:0 0 auto; border-radius:20px; overflow:hidden; position:relative;
      background:linear-gradient(135deg,#1e293b,#0b1220);
      box-shadow:0 18px 40px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.10) inset; }
    .art img { width:100%; height:100%; object-fit:cover; display:block; }
    .art .fallback { position:absolute; inset:0; display:grid; place-items:center; color:rgba(255,255,255,.28); }
    .art .fallback ha-icon { --mdc-icon-size:44px; }
    .meta { min-width:0; flex:1; display:flex; flex-direction:column; gap:6px; }
    .kicker { font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:rgba(255,255,255,.5); }
    .title { font-size:clamp(16px,2.5cqi,22px); font-weight:700; color:#fff; line-height:1.25;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .artist { font-size:13px; color:rgba(255,255,255,.62); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .badge { align-self:flex-start; font-size:10px; padding:4px 9px; border-radius:999px; letter-spacing:.08em;
      background:rgba(255,255,255,.08); color:rgba(255,255,255,.7); border:1px solid rgba(255,255,255,.1); }
    .badge.live { color:#bbf7d0; border-color:rgba(74,222,128,.35); background:rgba(34,197,94,.14); }

    .progress { display:flex; align-items:center; gap:9px; font-size:11px; color:rgba(255,255,255,.55);
      font-variant-numeric:tabular-nums; }
    .bar { position:relative; flex:1; height:4px; border-radius:99px; background:rgba(255,255,255,.14); overflow:hidden; }
    .bar > i { position:absolute; inset:0 auto 0 0; width:0%; border-radius:99px;
      background:linear-gradient(90deg,rgba(125,211,252,.9),rgba(255,255,255,.96)); transition:width .35s linear; }

    .lyrics { position:relative; flex:1 1 0; min-height:0; overflow:hidden; border-radius:16px;
      mask-image:linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%);
      -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%); }
    .scroller { position:absolute; inset:0; overflow:hidden; padding:0 4px; }
    .line { padding:7px 2px; text-align:center; font-size:clamp(15px,3.3cqi,20px); line-height:1.58;
      color:rgba(255,255,255,.32); transition:color .25s ease, transform .32s ease, opacity .25s ease;
      will-change:transform; }
    .line.active { color:#fff; font-weight:700; transform:scale(1.045);
      text-shadow:0 0 24px rgba(125,211,252,.5), 0 0 60px rgba(125,211,252,.22); }
    .line.past { opacity:.5; }
    .empty { position:absolute; inset:0; display:grid; place-items:center; text-align:center;
      color:rgba(255,255,255,.42); font-size:13px; padding:0 16px; line-height:1.6; }
    .skeleton { position:absolute; inset:0; display:grid; place-items:center; }
    .dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.55); margin:0 4px;
      animation:pulse 1.15s infinite ease-in-out; }
    .dot:nth-child(2){ animation-delay:.15s } .dot:nth-child(3){ animation-delay:.3s }
    @keyframes pulse { 0%,100%{opacity:.22; transform:translateY(0)} 50%{opacity:1; transform:translateY(-3px)} }
    .row { display:flex; align-items:center; justify-content:center; gap:5px; }

    .volrow { display:flex; align-items:center; gap:8px; }
    .volrow button { width:26px; height:26px; border-radius:8px; border:1px solid rgba(255,255,255,.1);
      background:rgba(255,255,255,.05); color:rgba(255,255,255,.8); display:grid; place-items:center;
      cursor:pointer; flex:0 0 auto; }
    .volrow button ha-icon { --mdc-icon-size:16px; }
    .volrow input[type=range] { -webkit-appearance:none; appearance:none; flex:1; height:4px; border-radius:99px;
      background:rgba(255,255,255,.16); outline:none; cursor:pointer; }
    .volrow input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:13px;
      border-radius:50%; background:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.12); cursor:pointer; }
    .volrow input[type=range]::-moz-range-thumb { width:13px; height:13px; border:none; border-radius:50%;
      background:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.12); cursor:pointer; }
    .volrow .pct { width:34px; text-align:right; font-size:10.5px; color:rgba(255,255,255,.55);
      font-variant-numeric:tabular-nums; }

    .playerbar { display:flex; align-items:center; }
    .pchip { display:flex; align-items:center; gap:7px; width:100%; min-width:0; padding:6px 10px;
      border-radius:12px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.045);
      color:rgba(255,255,255,.75); font-size:11.5px; cursor:pointer; text-align:left; }
    .pchip:hover { background:rgba(255,255,255,.10); }
    .pchip ha-icon { --mdc-icon-size:15px; opacity:.85; flex:0 0 auto; }
    .pchip span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pchip .chev { --mdc-icon-size:16px; opacity:.55; }

    .picker { position:absolute; inset:0; z-index:5; display:flex; align-items:flex-end; }
    .picker .backdrop { position:absolute; inset:0; background:rgba(3,6,12,.62); backdrop-filter:blur(6px);
      -webkit-backdrop-filter:blur(6px); border-radius:26px; }
    .picker .sheet { position:relative; width:100%; max-height:72%; display:flex; flex-direction:column;
      background:rgba(16,21,31,.97); border-top:1px solid rgba(255,255,255,.10);
      border-radius:22px 22px 26px 26px; padding:12px 12px 10px; box-shadow:0 -18px 40px rgba(0,0,0,.5);
      animation:sheetIn .22s ease-out; }
    @keyframes sheetIn { from { transform:translateY(14px); opacity:.4 } to { transform:none; opacity:1 } }
    .phead { display:flex; align-items:center; justify-content:space-between; padding:2px 6px 8px;
      font-size:12px; letter-spacing:.06em; color:rgba(255,255,255,.6); text-transform:uppercase; }
    .phead button { width:26px; height:26px; border-radius:8px; border:none; background:rgba(255,255,255,.08);
      color:rgba(255,255,255,.75); cursor:pointer; display:grid; place-items:center; }
    .psearch { margin:0 4px 8px; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.05); color:#fff; font-size:13px; outline:none; }
    .psearch::placeholder { color:rgba(255,255,255,.35); }
    .plist { overflow-y:auto; -webkit-overflow-scrolling:touch; padding:2px 2px 6px; }
    .prow { display:flex; align-items:center; gap:9px; padding:9px 8px; border-radius:10px; cursor:pointer;
      color:rgba(255,255,255,.82); font-size:13px; }
    .prow:hover { background:rgba(255,255,255,.07); }
    .prow.active { background:rgba(125,211,252,.14); color:#fff; }
    .prow ha-icon { --mdc-icon-size:18px; opacity:.8; flex:0 0 auto; }
    .prow .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .prow .st { font-size:10.5px; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.06em; }
    .prow .st.live { color:#86efac; }
    .prow.sep { margin-top:4px; border-top:1px solid rgba(255,255,255,.07); border-radius:0; cursor:default; }
    .prow.sep:hover { background:none; }

    .transport { display:flex; align-items:center; justify-content:center; gap:16px; padding-top:2px; }
    .transport button { width:40px; height:40px; border-radius:50%; border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06); color:#fff; display:grid; place-items:center; cursor:pointer;
      transition:transform .12s ease, background .2s ease; }
    .transport button ha-icon { --mdc-icon-size:22px; }
    .transport button:hover { background:rgba(255,255,255,.14); }
    .transport button:active { transform:scale(.94); }
    .transport button.play { width:52px; height:52px; background:rgba(255,255,255,.95); color:#0b1020; border:none;
      box-shadow:0 10px 28px rgba(255,255,255,.16); }
    .transport button.play ha-icon { --mdc-icon-size:26px; }

    @container (max-width: 430px) {
      .art { width:96px; height:96px; border-radius:16px; }
      .wrap { padding:14px 14px 12px; }
      .line { font-size:15.5px; }
    }
    @container (min-width: 620px) {
      .art { width:180px; height:180px; }
      .line { font-size:21px; }
    }
  `;

  class KaraokeNowPlaying extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = null;
      this._hass = null;
      this._trackKey = null;
      this._lyrics = [];
      this._plain = "";
      this._status = "idle"; // idle | loading | ready | empty | error
      this._activeIndex = -1;
      this._artUrl = "";
      this._tick = null;
      this._manual = null;
      this._manualLoaded = false;
    }

    setConfig(config) {
      if (!config || (!config.entity && !(config.entities && config.entities.length))) {
        throw new Error("karaoke-now-playing: 'entity' or 'entities' is required");
      }
      this._config = Object.assign(
        {
          language: "th", show_transport: true, accent: "#7dd3fc", offset: 0,
          pick: "priority",          // priority = first playing in the entities list
          prefer_lyrics: true,       // if a player has no lyrics, try the next playing one
          show_player_switch: true,
          show_volume: true,
          compact: false,
        },
        config
      );
      if (!this._config.entities) {
        this._config.entities = [this._config.entity];
      }
      this._picked = this._config.entity || this._config.entities[0];
      this._render();
    }

    connectedCallback() {
      if (!this._tick) {
        this._tick = setInterval(() => this._onTick(), 400);
      }
    }

    disconnectedCallback() {
      if (this._tick) { clearInterval(this._tick); this._tick = null; }
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first) this._render();
      const st = this._state();
      if (!st) return;
      const key = [st.state.attributes.media_title, st.state.attributes.media_artist,
        st.state.attributes.media_album_name, Math.round(st.state.attributes.media_duration || 0)].join("|");
      if (key !== this._trackKey) {
        this._trackKey = key;
        this._missed = new Set();
        this._tried = [];
        this._loadLyrics();
      } else if (st.entityId !== this._lastEntity) {
        this._lastEntity = st.entityId;
        this._loadLyrics();
      }
      this._updateTrackBits();
    }

    _liveEntities() {
      const hass = this._hass;
      return (this._config.entities || []).filter((id) => {
        const s = hass.states[id];
        return s && (s.state === "playing" || s.state === "buffering");
      });
    }

    _pickEntity() {
      const hass = this._hass;
      const list = this._config.entities || [];
      if (!this._manualLoaded) {
        this._manualLoaded = true;
        this._manual = this._readManual();
      }
      if (this._manual) {
        const ms = hass.states[this._manual];
        if (ms && ms.state !== "unavailable" && ms.state !== "unknown") return this._manual;
      }
      const live = this._liveEntities();
      const paused = list.filter((id) => hass.states[id] && hass.states[id].state === "paused");
      const pool = live.length ? live : paused;
      if (!pool.length) return this._picked || list[0];

      if (this._config.pick === "latest") {
        return pool
          .map((id) => ({ id, t: Date.parse(hass.states[id].last_updated || 0) || 0 }))
          .sort((a, b) => b.t - a.t)[0].id;
      }
      // prefer a player that has not failed the lyrics lookup for this track
      if (this._config.prefer_lyrics !== false && this._missed && this._missed.size) {
        const fresh = pool.filter((id) => !this._missed.has(id));
        if (fresh.length) return fresh[0];
      }
      return pool[0];
    }

    _state() {
      if (!this._hass || !this._config) return null;
      const id = this._pickEntity();
      const state = this._hass.states[id];
      return state ? { state, entityId: id } : null;
    }

    _render() {
      if (!this.shadowRoot || !this._config) return;
      const t = this._config.language === "en"
        ? { now: "Now playing", empty: "No lyrics found for this track", loading: "Looking for lyrics…", idle: "Nothing playing" }
        : { now: "กำลังเล่น", empty: "ไม่พบเนื้อเพลงของเพลงนี้", loading: "กำลังค้นหาเนื้อเพลง…", idle: "ยังไม่มีเพลงเล่น" };

      this.shadowRoot.innerHTML = `
        <style>${STYLE}</style>
        <ha-card class="${this._config.compact ? "compact" : ""}">
          <div class="wrap">
            <div class="bg" id="bg"></div>
            <div class="veil"></div>
            <div class="inner">
              <div class="top">
                <div class="art" id="art"><div class="fallback"><ha-icon icon="mdi:music-note"></ha-icon></div></div>
                <div class="meta">
                  <span class="kicker">${t.now}</span>
                  <div class="title" id="title">—</div>
                  <div class="artist" id="artist"></div>
                  <span class="badge" id="badge">—</span>
                </div>
              </div>
              <div class="progress">
                <span id="tcur">0:00</span>
                <div class="bar"><i id="tbar"></i></div>
                <span id="tdur">0:00</span>
              </div>
              ${this._config.show_player_switch ? `
              <div class="playerbar">
                <button class="pchip" id="popen" title="เลือกเครื่องเล่น">
                  <ha-icon icon="mdi:speaker"></ha-icon>
                  <span id="pname">—</span>
                  <ha-icon icon="mdi:chevron-up" class="chev"></ha-icon>
                </button>
              </div>` : ""}
              ${this._config.show_volume ? `
              <div class="volrow">
                <button id="mute" title="ปิด/เปิดเสียง"><ha-icon icon="mdi:volume-high"></ha-icon></button>
                <input type="range" id="vol" min="0" max="100" step="1" value="50" />
                <span class="pct" id="volpct">–</span>
              </div>` : ""}
              <div class="lyrics" id="lyrics">
                <div class="scroller" id="scroller"></div>
                <div class="empty" id="empty" hidden></div>
                <div class="skeleton" id="skeleton" hidden><div class="row"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div></div>
              </div>
              ${this._config.show_transport ? `
              <div class="transport">
                <button id="prev" title="ก่อนหน้า"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
                <button class="play" id="play" title="เล่น/หยุด"><ha-icon icon="mdi:play"></ha-icon></button>
                <button id="next" title="ถัดไป"><ha-icon icon="mdi:skip-next"></ha-icon></button>
              </div>` : ""}
            </div>
            <div class="picker" id="picker" hidden>
              <div class="backdrop" id="pbackdrop"></div>
              <div class="sheet">
                <div class="phead"><span>เลือกเครื่องเล่น</span><button id="pclose"><ha-icon icon="mdi:close"></ha-icon></button></div>
                <input class="psearch" id="psearch" placeholder="ค้นหาเครื่องเล่น…" />
                <div class="plist" id="plist"></div>
              </div>
            </div>
          </div>
        </ha-card>`;

      this.$ = (id) => this.shadowRoot.getElementById(id);

      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      const host = this.$("lyrics");
      if (host && typeof ResizeObserver !== "undefined") {
        this._ro = new ResizeObserver((entries) => {
          const h = entries[0].contentRect.height;
          const pad = Math.max(20, Math.round(h * 0.42));
          const sc = this.$("scroller");
          if (!sc) return;
          sc.style.paddingTop = pad + "px";
          sc.style.paddingBottom = pad + "px";
          this._activeIndex = -1;
          this._syncLyrics(this._position().pos);
        });
        this._ro.observe(host);
      }

      if (this._config.show_volume) {
        const vol = this.$("vol");
        const mute = this.$("mute");
        if (vol) {
          vol.oninput = () => {
            this._dragging = true;
            const pct = Number(vol.value);
            const el = this.$("volpct"); if (el) el.textContent = pct + "%";
            clearTimeout(this._volTimer);
            this._volTimer = setTimeout(() => {
              this._dragging = false;
              this._setVolume(pct / 100);
            }, 180);
          };
        }
        if (mute) mute.onclick = () => this._toggleMute();
      }
      if (this._config.show_player_switch) {
        const open = this.$("popen");
        const close = this.$("pclose");
        const back = this.$("pbackdrop");
        const search = this.$("psearch");
        if (open) open.onclick = () => this._openPicker();
        if (close) close.onclick = () => this._closePicker();
        if (back) back.onclick = () => this._closePicker();
        if (search) search.oninput = () => this._renderPicker(search.value);
      }
      if (this._config.show_transport) {
        this.$("prev").onclick = () => this._service("media_previous_track");
        this.$("next").onclick = () => this._service("media_next_track");
        this.$("play").onclick = () => this._service("media_play_pause");
      }
      this._status = this._lyrics.length ? "ready" : "idle";
      this._paintLyrics();
      this._updateTrackBits();
    }

    _setVolume(level) {
      const st = this._state();
      const id = (st && st.entityId) || this._config.entity || (this._config.entities || [])[0];
      if (!id) return;
      this._hass.callService("media_player", "volume_set", { entity_id: id, volume_level: level });
    }

    _toggleMute() {
      const st = this._state();
      if (!st) return;
      const muted = !!st.state.attributes.is_volume_muted;
      this._hass.callService("media_player", "volume_mute", { entity_id: st.entityId, is_volume_muted: !muted });
    }

    _service(name) {
      if (!this._hass || !this._config) return;
      const st = this._state();
      const id = (st && st.entityId) || this._config.entity || this._config.entities[0];
      this._hass.callService("media_player", name, { entity_id: id });
    }

    _updateTrackBits() {
      const st = this._state();
      if (!st || !this.$) return;
      const a = st.state.attributes || {};
      const title = a.media_title || st.state.state;
      const artist = a.media_artist || a.media_album_name || "";
      this.$("title").textContent = title || "—";
      this.$("artist").textContent = artist;
      const badge = this.$("badge");
      const playing = st.state.state === "playing";
      badge.textContent = playing ? (this._config.language === "en" ? "LIVE" : "กำลังเล่น") : (st.state.state || "idle");
      badge.classList.toggle("live", playing);

      // MA exposes http://<lan-ip>:8095 imageproxy URLs that browsers block as
      // mixed content on the https dashboard, so prefer HA's local proxy first.
      const artCands = [a.entity_picture_local, a.media_image_url, a.entity_picture].filter(Boolean);
      let art = artCands.find((u) => !(location.protocol === "https:" && /^http:\/\//i.test(u))) || "";
      if (art && art.startsWith("/")) art = location.origin + art;
      if (art !== this._artUrl) {
        this._artUrl = art;
        const artEl = this.$("art");
        artEl.innerHTML = art
          ? `<img src="${escapeHtml(art)}" alt="">`
          : `<div class="fallback"><ha-icon icon="mdi:music-note"></ha-icon></div>`;
        this.$("bg").style.backgroundImage = art ? `url("${art}")` : "none";
      }
      const volEl = this.$("vol");
      if (volEl && !this._dragging) {
        const lvl = Number(a.volume_level);
        if (Number.isFinite(lvl)) {
          volEl.value = String(Math.round(lvl * 100));
          const pct = this.$("volpct"); if (pct) pct.textContent = Math.round(lvl * 100) + "%";
        } else {
          const pct = this.$("volpct"); if (pct) pct.textContent = "–";
        }
      }
      const muteEl = this.$("mute");
      if (muteEl) {
        const muted = !!a.is_volume_muted || Number(a.volume_level) === 0;
        muteEl.innerHTML = `<ha-icon icon="${muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>`;
      }

      const pn = this.$("pname");
      if (pn) {
        const id = st.entityId;
        const s2 = this._hass.states[id];
        pn.textContent = (s2 && (s2.attributes.friendly_name || id)) || id;
      }
      if (this._config.show_transport) {
        const btn = this.$("play");
        btn.innerHTML = playing
          ? '<ha-icon icon="mdi:pause"></ha-icon>'
          : '<ha-icon icon="mdi:play"></ha-icon>';
      }
    }

    _position() {
      const st = this._state();
      if (!st) return { pos: 0, dur: 0 };
      const a = st.state.attributes || {};
      const dur = Number(a.media_duration) || 0;
      let pos = Number(a.media_position) || 0;
      if (st.state.state === "playing" && a.media_position_updated_at) {
        const t = Date.parse(a.media_position_updated_at);
        if (!Number.isNaN(t)) pos += (Date.now() - t) / 1000;
      }
      if (dur) pos = Math.min(pos, dur);
      return { pos: Math.max(0, pos), dur };
    }

    _onTick() {
      if (!this._hass || !this._config || !this.$) return;
      const { pos, dur } = this._position();
      this.$("tcur").textContent = fmtTime(pos);
      this.$("tdur").textContent = fmtTime(dur);
      this.$("tbar").style.width = dur ? Math.min(100, (pos / dur) * 100) + "%" : "0%";
      if (this._lyrics.length) this._syncLyrics(pos);
    }

    _syncLyrics(pos) {
      const p = pos + (Number(this._config.offset) || 0);
      let idx = -1;
      for (let i = 0; i < this._lyrics.length; i++) {
        if (this._lyrics[i].t <= p) idx = i; else break;
      }
      if (idx === this._activeIndex) return;
      this._activeIndex = idx;
      const nodes = this.$("scroller").children;
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle("active", i === idx);
        nodes[i].classList.toggle("past", i < idx);
      }
      if (idx >= 0 && nodes[idx]) {
        const scroller = this.$("scroller");
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const target = Math.min(max, Math.max(0, nodes[idx].offsetTop - scroller.clientHeight * 0.45));
        if (Math.abs(scroller.scrollTop - target) > 4) {
          scroller.scrollTo({ top: target, behavior: "smooth" });
        }
      }
    }

    _paintLyrics() {
      if (!this.$) return;
      const scroller = this.$("scroller");
      const empty = this.$("empty");
      const skeleton = this.$("skeleton");
      const t = this._config.language === "en"
        ? { empty: "No lyrics found for this track", loading: "Looking for lyrics…", idle: "Nothing playing" }
        : { empty: "ไม่พบเนื้อเพลงของเพลงนี้", loading: "กำลังค้นหาเนื้อเพลง…", idle: "ยังไม่มีเพลงเล่น" };

      skeleton.hidden = this._status !== "loading";
      if (this._status === "loading") { scroller.innerHTML = ""; empty.hidden = true; return; }

      if (this._lyrics.length) {
        empty.hidden = true;
        scroller.innerHTML = this._lyrics
          .map((l) => `<div class="line">${escapeHtml(l.text) || "&nbsp;"}</div>`)
          .join("");
        this._activeIndex = -1;
        requestAnimationFrame(() => {
          const { pos } = this._position();
          this._activeIndex = -1;
          this._syncLyrics(pos);
          setTimeout(() => { this._activeIndex = -1; this._syncLyrics(this._position().pos); }, 450);
        });
        return;
      }

      scroller.innerHTML = "";
      empty.hidden = false;
      empty.textContent = this._status === "empty" ? t.empty
        : this._status === "error" ? t.empty : t.idle;
    }

    _storageKey() {
      const id = (this._config.entities && this._config.entities[0]) || this._config.entity || "default";
      return "karaoke:pick:" + location.pathname + ":" + id;
    }

    _readManual() {
      try { return localStorage.getItem(this._storageKey()) || null; } catch (e) { return null; }
    }

    _writeManual(id) {
      try {
        if (id) localStorage.setItem(this._storageKey(), id);
        else localStorage.removeItem(this._storageKey());
      } catch (e) { /* ignore */ }
    }

    _playerOptions() {
      const hass = this._hass;
      const ids = (this._config.players && this._config.players.length)
        ? this._config.players
        : Object.keys(hass.states).filter((id) => id.indexOf("media_player.") === 0);
      const rank = { playing: 0, buffering: 1, paused: 2, idle: 3, off: 4 };
      return ids
        .filter((id) => hass.states[id] && hass.states[id].state !== "unavailable" && hass.states[id].state !== "unknown")
        .map((id) => ({ id, s: hass.states[id] }))
        .sort((a, b) => {
          const ra = rank[a.s.state] == null ? 5 : rank[a.s.state];
          const rb = rank[b.s.state] == null ? 5 : rank[b.s.state];
          if (ra !== rb) return ra - rb;
          return String(a.s.attributes.friendly_name || a.id)
            .localeCompare(String(b.s.attributes.friendly_name || b.id), "th");
        });
    }

    _openPicker() {
      const picker = this.$("picker");
      if (!picker) return;
      const search = this.$("psearch");
      if (search) search.value = "";
      this._renderPicker("");
      picker.hidden = false;
      if (search) setTimeout(() => search.focus(), 60);
    }

    _closePicker() {
      const picker = this.$("picker");
      if (picker) picker.hidden = true;
    }

    _renderPicker(filter) {
      const list = this.$("plist");
      if (!list) return;
      const cur = this._state();
      const curId = cur && cur.entityId;
      const q = String(filter || "").trim().toLowerCase();
      const icon = (st) => st === "playing" ? "mdi:speaker-wireless"
        : st === "paused" ? "mdi:pause-circle-outline"
        : st === "buffering" ? "mdi:progress-clock"
        : st === "off" ? "mdi:speaker-off" : "mdi:speaker";
      const label = (st) => st === "playing" ? "กำลังเล่น"
        : st === "paused" ? "หยุดชั่วคราว"
        : st === "buffering" ? "กำลังโหลด"
        : st === "off" ? "ปิด" : "ว่าง";

      const rows = [];
      rows.push(`<div class="prow ${this._manual ? "" : "active"}" data-id="">
        <ha-icon icon="mdi:auto-fix"></ha-icon>
        <span class="nm">อัตโนมัติ (เลือกเองตามที่กำลังเล่น)</span>
        <span class="st"></span></div>`);

      const opts = this._playerOptions().filter((o) => {
        if (!q) return true;
        const n = String(o.s.attributes.friendly_name || o.id).toLowerCase();
        return n.indexOf(q) >= 0 || o.id.toLowerCase().indexOf(q) >= 0;
      });
      if (!opts.length) {
        rows.push(`<div class="prow sep"><span class="nm">ไม่พบเครื่องเล่น</span></div>`);
      }
      opts.forEach((o) => {
        const name = o.s.attributes.friendly_name || o.id;
        const live = o.s.state === "playing" || o.s.state === "buffering";
        rows.push(`<div class="prow ${o.id === curId ? "active" : ""}" data-id="${escapeHtml(o.id)}">
          <ha-icon icon="${icon(o.s.state)}"></ha-icon>
          <span class="nm">${escapeHtml(name)}</span>
          <span class="st ${live ? "live" : ""}">${label(o.s.state)}</span></div>`);
      });
      list.innerHTML = rows.join("");
      list.querySelectorAll(".prow[data-id]").forEach((el) => {
        el.onclick = () => this._selectPlayer(el.getAttribute("data-id") || null);
      });
    }

    _selectPlayer(id) {
      this._manual = id || null;
      this._writeManual(this._manual);
      this._missed = new Set();
      this._tried = [];
      this._trackKey = null;
      this._activeIndex = -1;
      this._closePicker();
      this._loadLyrics();
      this._updateTrackBits();
    }

    _tryNextForLyrics() {
      if (this._config.prefer_lyrics === false || this._manual) return false;
      const st = this._state();
      const cur = st && st.entityId;
      if (!cur) return false;
      this._missed = this._missed || new Set();
      this._missed.add(cur);
      const next = this._pickEntity();
      if (next && next !== cur) {
        this._loadLyrics();
        this._updateTrackBits();
        return true;
      }
      return false;
    }

    _loadLyrics() {
      const st = this._state();
      this._lastEntity = st && st.entityId;
      this._lyrics = [];
      this._plain = "";
      this._activeIndex = -1;
      if (!st) { this._status = "idle"; this._paintLyrics(); return; }

      const a = st.state.attributes || {};
      const title = (a.media_title || "").trim();
      const artist = (a.media_artist || "").trim();
      const album = (a.media_album_name || "").trim();
      const dur = Math.round(Number(a.media_duration) || 0);
      if (!title) { this._status = "idle"; this._paintLyrics(); return; }

      const cacheKey = "karaoke:v2:" + [artist, title, dur].join("|").toLowerCase();
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.lrc || parsed.plain)) {
            this._applyLyrics(parsed.lrc, parsed.plain);
            return;
          }
        }
      } catch (e) { /* ignore cache errors */ }

      this._status = "loading";
      this._paintLyrics();

      const fetchJson = (url) => fetch(url)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);

      const q = new URLSearchParams({ artist_name: artist, track_name: title });
      if (album) q.set("album_name", album);
      if (dur) q.set("duration", String(dur));

      fetchJson("https://lrclib.net/api/get?" + q.toString()).then((exact) => {
        if (exact && exact.syncedLyrics) return exact;
        const s = new URLSearchParams({ q: [artist, title].filter(Boolean).join(" ") });
        return fetchJson("https://lrclib.net/api/search?" + s.toString()).then((list) => {
          if (!Array.isArray(list) || !list.length) return exact || null;
          const scored = list
            .map((x) => {
              let score = 0;
              if (x.syncedLyrics) score += 100;
              if (dur && x.duration) score -= Math.min(40, Math.abs(x.duration - dur));
              if (!artist || (x.artistName || "").toLowerCase() === artist.toLowerCase()) score += 15;
              if (x.albumName && album && x.albumName.toLowerCase() === album.toLowerCase()) score += 8;
              return { x, score };
            })
            .sort((p, q2) => q2.score - p.score);
          return scored[0] ? scored[0].x : null;
        });
      }).then((hit) => {
        if (!hit) {
          this._status = "empty";
          this._paintLyrics();
          this._tryNextForLyrics();
          return;
        }
        const lrc = hit.syncedLyrics || "";
        const plain = hit.plainLyrics || "";
        try { localStorage.setItem(cacheKey, JSON.stringify({ lrc, plain })); } catch (e) { /* quota */ }
        this._applyLyrics(lrc, plain);
      }).catch(() => {
        this._status = "error";
        this._paintLyrics();
        this._tryNextForLyrics();
      });
    }

    _applyLyrics(lrc, plain) {
      const lines = parseLrc(lrc);
      if (lines.length) {
        this._lyrics = lines;
        this._status = "ready";
      } else if (plain) {
        this._lyrics = plain.split(/\r?\n/).filter((x) => x.trim()).map((text) => ({ t: -1, text }));
        this._status = "ready";
      } else {
        this._status = "empty";
      }
      this._paintLyrics();
      const { pos } = this._position();
      if (this._lyrics.length) this._syncLyrics(pos);
    }

    getCardSize() { return 8; }
    static getStubConfig() { return { entity: "media_player.homepod" }; }
  }

  if (!customElements.get("karaoke-now-playing")) {
    customElements.define("karaoke-now-playing", KaraokeNowPlaying);
  }
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "karaoke-now-playing",
    name: "Karaoke Now Playing",
    description: "Artwork, progress and synced lyrics for the current track.",
    preview: true,
  });
})();
