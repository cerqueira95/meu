(function () {
  var historyStack = ["home"];
  var activeType = "m3u";
  var catalog = [];
  var playlists = [];
  var activePlaylistId = null;
  var xtreamSessions = {};
  var browseType = "live";
  var browseCategory = "";
  var browseSearch = "";
  var selectedCatalogIndex = -1;
  var epgCache = {};
  var shortEpgCache = {};
  var fullHls = null;
  var previewHls = null;
  var seriesCache = {};
  var currentSeries = null;
  var currentSeriesSeasons = {};
  var currentSeriesSeason = null;
  var settings = {
    smartBandwidth: true,
    resumePlayback: true,
    previewAudio: true
  };
  var currentPlayingIndex = -1;
  var currentPlaybackKey = "";
  var currentPlaybackKind = "";
  var currentStreamUrl = "";
  var playerRetryCount = 0;
  var lastProgressSaveAt = 0;
  var playbackWatchdog = null;
  var lastPlaybackTime = -1;
  var lastPlaybackAdvanceAt = 0;
  var lastAutoRecoveryAt = 0;
  var autoRecoveryInProgress = false;
  var recoveryTimeout = null;
  var pendingResumePosition = null;
  var playerHasStarted = false;
  var suppressLoadingOverlay = false;
  var browseRenderEntries = [];
  var browseRenderedCount = 0;
  var browseRenderMode = "";
  var browseRenderBusy = false;
  var LIVE_RENDER_BATCH = 70;
  var MEDIA_RENDER_BATCH = 36;
  var EPISODE_RENDER_BATCH = 32;
  var episodeRenderEntries = [];
  var episodeRenderedCount = 0;
  var episodeRenderBusy = false;
  var m3uSeriesGroupCache = null;
  var m3uSeriesGroupCacheKey = "";
  var seriesPrefetchTimer = null;
  var INTRO_SKIP_SECONDS = 90;
  var INTRO_VISIBLE_FROM = 5;
  var INTRO_VISIBLE_UNTIL = 150;
  var NEXT_EPISODE_WINDOW = 45;
  var currentEpisode = null;
  var currentNextEpisode = null;
  var selectedEpisodeForActions = null;
  var currentMovieIndex = -1;
  var playerUiTimer = null;
  var lastPlayerUiUpdateAt = 0;
  var catalogDbPromise = null;
  var editingPlaylistId = null;
  var playerFitMode = "fit";
  var REMOTE_PROXY_BASE = "https://smart-play-tv-proxy.onrender.com";
  var lastRootBackAt = 0;
  var ROOT_BACK_EXIT_WINDOW = 1800;

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem("smartplay_settings") || "{}");
      settings.smartBandwidth = saved.smartBandwidth !== false;
      settings.resumePlayback = saved.resumePlayback !== false;
      settings.previewAudio = saved.previewAudio !== false;
    } catch (error) {}

    var smart = document.getElementById("smartBandwidth");
    var resume = document.getElementById("resumePlayback");
    var audio = document.getElementById("previewAudio");

    if (smart) smart.checked = settings.smartBandwidth;
    if (resume) resume.checked = settings.resumePlayback;
    if (audio) audio.checked = settings.previewAudio;

    document.querySelectorAll(".setting-row[data-setting-target]").forEach(function (row) {
      var target = document.getElementById(row.dataset.settingTarget);
      row.setAttribute("aria-checked", target && target.checked ? "true" : "false");
    });
  }

  function saveSettings() {
    var smart = document.getElementById("smartBandwidth");
    var resume = document.getElementById("resumePlayback");
    var audio = document.getElementById("previewAudio");

    if (smart) settings.smartBandwidth = !!smart.checked;
    if (resume) settings.resumePlayback = !!resume.checked;
    if (audio) settings.previewAudio = !!audio.checked;

    try {
      localStorage.setItem("smartplay_settings", JSON.stringify(settings));
    } catch (error) {}
  }

  function progressStorageKey(key) {
    var playlist = activePlaylist();
    return (
      "smartplay_progress:" +
      (playlist ? playlist.id : "none") +
      ":" +
      String(key || "")
    );
  }

  function readProgress(key) {
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(progressStorageKey(key)) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveProgress(key, currentTime, duration, watched) {
    if (!key || !isFinite(currentTime) || currentTime < 0) return;

    var payload = {
      currentTime: currentTime,
      duration: isFinite(duration) ? duration : 0,
      watched: !!watched,
      updatedAt: Date.now()
    };

    try {
      localStorage.setItem(progressStorageKey(key), JSON.stringify(payload));
    } catch (error) {}
  }

  function progressPercent(key) {
    var progress = readProgress(key);
    if (!progress || !progress.duration) return 0;
    return Math.max(
      0,
      Math.min(100, Math.round((progress.currentTime / progress.duration) * 100))
    );
  }

  function isProgressContinuable(progress) {
    if (!progress || progress.watched || !progress.duration) return false;
    return (
      progress.currentTime >= 15 &&
      progress.currentTime < progress.duration * 0.95
    );
  }

  function seriesKeyFromItem(item) {
    if (!item) return "";

    var playlist = activePlaylist();
    if (playlist && playlist.type === "xtream") {
      return item.seriesId ? "xtream:" + String(item.seriesId) : "";
    }

    var meta = episodeMeta(item.name);
    return "m3u:" + normalizedText(meta.seriesName || item.name || "");
  }

  function seriesResumeStorageKey(seriesKey) {
    var playlist = activePlaylist();
    return playlist && seriesKey
      ? "smartplay_series_resume:" + playlist.id + ":" + seriesKey
      : "";
  }

  function readSeriesResume(seriesKey) {
    var key = seriesResumeStorageKey(seriesKey);
    if (!key) return null;

    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveSeriesResume(episode, currentTime, duration, completed) {
    if (!currentSeries || !currentSeries.key || !episode) return;

    var key = seriesResumeStorageKey(currentSeries.key);
    if (!key) return;

    var payload = {
      seriesKey: currentSeries.key,
      seriesName: currentSeries.name || "",
      season: Number(episode.season || 1),
      episode: Number(episode.episode || 1),
      episodeId: episode.id || "",
      catalogIndex:
        episode.catalogIndex != null ? Number(episode.catalogIndex) : -1,
      source: episode.source || "",
      title: episode.title || "",
      currentTime: Number(currentTime || 0),
      duration: Number(duration || 0),
      completed: !!completed,
      updatedAt: Date.now()
    };

    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {}
  }

  function seriesIsContinuable(item) {
    var key = seriesKeyFromItem(item);
    if (!key) return false;

    var resume = readSeriesResume(key);
    return !!resume && !resume.completed;
  }

  function continueCountForType(type) {
    if (type === "live") return 0;

    var playlist = activePlaylist();
    if (!playlist) return 0;

    var count = 0;

    try {
      if (type === "movie") {
        var moviePrefix = "smartplay_progress:" + playlist.id + ":movie:";
        for (var i = 0; i < localStorage.length; i++) {
          var movieKey = localStorage.key(i);
          if (!movieKey || movieKey.indexOf(moviePrefix) !== 0) continue;

          var progress = JSON.parse(localStorage.getItem(movieKey) || "null");
          if (isProgressContinuable(progress)) count += 1;
        }
        return count;
      }

      var seriesPrefix = "smartplay_series_resume:" + playlist.id + ":";
      for (var j = 0; j < localStorage.length; j++) {
        var seriesKey = localStorage.key(j);
        if (!seriesKey || seriesKey.indexOf(seriesPrefix) !== 0) continue;

        var resume = JSON.parse(localStorage.getItem(seriesKey) || "null");
        if (resume && !resume.completed) count += 1;
      }
    } catch (error) {}

    return count;
  }

  function seasonStorageKey() {
    var playlist = activePlaylist();
    return playlist && currentSeries && currentSeries.key
      ? "smartplay_series_season:" + playlist.id + ":" + currentSeries.key
      : "";
  }

  function rememberSeriesSeason(season) {
    var key = seasonStorageKey();
    if (!key) return;

    try {
      localStorage.setItem(key, String(season));
    } catch (error) {}
  }

  function readRememberedSeriesSeason() {
    var key = seasonStorageKey();
    if (!key) return "";

    try {
      return localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function introDurationStorageKey() {
    var playlist = activePlaylist();
    return playlist && currentSeries && currentSeries.key
      ? "smartplay_intro_skip:" + playlist.id + ":" + currentSeries.key
      : "";
  }

  function readIntroDuration() {
    var key = introDurationStorageKey();
    if (!key) return INTRO_SKIP_SECONDS;

    try {
      var value = Number(localStorage.getItem(key) || INTRO_SKIP_SECONDS);
      return [60, 90, 120].indexOf(value) >= 0
        ? value
        : INTRO_SKIP_SECONDS;
    } catch (error) {
      return INTRO_SKIP_SECONDS;
    }
  }

  function cycleIntroDuration() {
    var values = [60, 90, 120];
    var current = readIntroDuration();
    var index = values.indexOf(current);
    var next = values[(index + 1) % values.length];
    var key = introDurationStorageKey();

    if (key) {
      try {
        localStorage.setItem(key, String(next));
      } catch (error) {}
    }

    updateSeriesHeroActions();
  }

  function findEpisodeFromResume(resume) {
    if (!resume) return null;
    var episodes = flattenSeriesEpisodes();

    for (var i = 0; i < episodes.length; i++) {
      var episode = episodes[i];

      if (
        resume.episodeId &&
        episode.id &&
        String(episode.id) === String(resume.episodeId)
      ) {
        return episode;
      }

      if (
        Number(episode.season || 1) === Number(resume.season || 1) &&
        Number(episode.episode || 0) === Number(resume.episode || 0)
      ) {
        return episode;
      }

      if (
        resume.catalogIndex != null &&
        Number(resume.catalogIndex) >= 0 &&
        Number(episode.catalogIndex) === Number(resume.catalogIndex)
      ) {
        return episode;
      }
    }

    return null;
  }

  function updateSeriesHeroActions() {
    var continueButton = document.getElementById("seriesContinue");
    var markButton = document.getElementById("seriesMarkEpisode");
    var introButton = document.getElementById("seriesIntroDuration");

    if (!continueButton || !markButton || !introButton) return;

    var resume =
      currentSeries && currentSeries.key
        ? readSeriesResume(currentSeries.key)
        : null;
    var resumeEpisode = findEpisodeFromResume(resume);

    continueButton.disabled = !resumeEpisode || !!(resume && resume.completed);
    continueButton.textContent = resumeEpisode
      ? "▶ Continuar T" +
        String(resumeEpisode.season || 1) +
        " E" +
        String(resumeEpisode.episode || 1)
      : "▶ Continuar episódio";

    markButton.disabled = !selectedEpisodeForActions;
    if (selectedEpisodeForActions) {
      var progress = readProgress(
        episodePlaybackKey(selectedEpisodeForActions)
      );
      markButton.textContent =
        progress && progress.watched
          ? "Marcar como não assistido"
          : "Marcar como assistido";
    } else {
      markButton.textContent = "Marcar como assistido";
    }

    introButton.textContent =
      "Pular abertura: " + readIntroDuration() + "s";
  }

  function continueCurrentSeries() {
    if (!currentSeries || !currentSeries.key) return;

    var resume = readSeriesResume(currentSeries.key);
    var episode = findEpisodeFromResume(resume);

    if (episode) {
      selectedEpisodeForActions = episode;
      playSeriesEpisode(episode);
    }
  }

  function toggleSelectedEpisodeWatched() {
    var episode = selectedEpisodeForActions;
    if (!episode) return;

    var key = episodePlaybackKey(episode);
    var current = readProgress(key);
    var watched = !(current && current.watched);
    var duration =
      current && current.duration ? Number(current.duration) : 1;
    var currentTime = watched ? duration : 0;

    saveProgress(key, currentTime, duration, watched);

    if (!watched && currentSeries && currentSeries.key) {
      saveSeriesResume(episode, 0, duration, false);
    }

    if (
      currentSeries &&
      currentSeries.key &&
      watched &&
      findEpisodeFromResume(readSeriesResume(currentSeries.key)) === episode
    ) {
      var next = findNextEpisode(episode);
      if (next) {
        saveSeriesResume(next, 0, 0, false);
      } else {
        saveSeriesResume(episode, duration, duration, true);
      }
    }

    renderEpisodes();
    updateSeriesHeroActions();
  }

  function episodePlaybackKey(episode) {
    if (!episode) return "";
    if (episode.source === "m3u") {
      return playbackKeyForItem(catalog[episode.catalogIndex]);
    }
    return "episode:" + String(episode.id || "");
  }

  function flattenSeriesEpisodes() {
    var flattened = [];
    Object.keys(currentSeriesSeasons)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .forEach(function (season) {
        (currentSeriesSeasons[season] || [])
          .slice()
          .sort(function (a, b) {
            return Number(a.episode || 0) - Number(b.episode || 0);
          })
          .forEach(function (episode) {
            flattened.push(episode);
          });
      });
    return flattened;
  }

  function findNextEpisode(episode) {
    if (!episode) return null;
    var episodes = flattenSeriesEpisodes();
    var currentKey = episodePlaybackKey(episode);

    for (var i = 0; i < episodes.length; i++) {
      if (episodePlaybackKey(episodes[i]) === currentKey) {
        return episodes[i + 1] || null;
      }
    }

    return null;
  }

  function updateEpisodeActionButtons(forceEnded) {
    var video = document.getElementById("video");
    var skip = document.getElementById("skipIntro");
    var next = document.getElementById("nextEpisode");

    if (!video || !skip || !next) return;

    var isEpisode =
      currentPlaybackKind === "series" &&
      !!currentEpisode &&
      !!currentSeries;

    var currentTime = Number(video.currentTime || 0);
    var duration = Number(video.duration || 0);

    skip.textContent =
      "Pular abertura (" + readIntroDuration() + "s)";
    skip.classList.toggle(
      "visible",
      isEpisode &&
        currentTime >= INTRO_VISIBLE_FROM &&
        currentTime <= INTRO_VISIBLE_UNTIL &&
        (!duration || currentTime + 5 < duration)
    );

    currentNextEpisode = isEpisode ? findNextEpisode(currentEpisode) : null;

    var nearEnd =
      isEpisode &&
      currentNextEpisode &&
      duration > 0 &&
      duration - currentTime <= NEXT_EPISODE_WINDOW;

    if (currentNextEpisode) {
      next.textContent =
        "Próximo: T" +
        String(currentNextEpisode.season || 1) +
        " E" +
        String(currentNextEpisode.episode || 1);
    } else {
      next.textContent = "Próximo episódio";
    }

    next.classList.toggle(
      "visible",
      !!currentNextEpisode && (!!forceEnded || nearEnd)
    );
  }

  function hideEpisodeActionButtons() {
    var skip = document.getElementById("skipIntro");
    var next = document.getElementById("nextEpisode");
    if (skip) skip.classList.remove("visible");
    if (next) next.classList.remove("visible");
  }

  function clearTemporaryCache() {
    epgCache = {};
    shortEpgCache = {};
    seriesCache = {};
    stopPreview();
    stopPlayer();

    try {
      Object.keys(localStorage).forEach(function (key) {
        if (
          key.indexOf("smartplay_progress:") === 0 ||
          key.indexOf("smartplay_series_resume:") === 0 ||
          key.indexOf("smartplay_series_season:") === 0
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {}
  }

  function showPlayerUi() {
    var topbar = document.querySelector(".player-topbar");
    if (!topbar) return;

    topbar.classList.remove("ui-hidden");

    if (playerUiTimer) {
      clearTimeout(playerUiTimer);
    }

    playerUiTimer = setTimeout(function () {
      var player = document.getElementById("player");
      if (player && player.classList.contains("active")) {
        topbar.classList.add("ui-hidden");
      }
    }, 3200);
  }

  function applyPlayerFitMode(mode) {
    var video = document.getElementById("video");
    var button = document.getElementById("playerFitMode");
    if (!video) return;

    playerFitMode =
      mode === "fill" || mode === "original" ? mode : "fit";

    video.classList.remove(
      "video-fit",
      "video-fill",
      "video-original"
    );
    video.classList.add("video-" + playerFitMode);

    if (button) {
      button.textContent =
        playerFitMode === "fill"
          ? "Proporção: Preencher"
          : playerFitMode === "original"
          ? "Proporção: Original"
          : "Proporção: Ajustar";
    }

    try {
      localStorage.setItem("smartplay_player_fit_mode", playerFitMode);
    } catch (error) {}
  }

  function cyclePlayerFitMode() {
    var next =
      playerFitMode === "fit"
        ? "fill"
        : playerFitMode === "fill"
        ? "original"
        : "fit";
    applyPlayerFitMode(next);
    showPlayerUi();
  }

  function loadPlayerFitMode() {
    var saved = "fit";
    try {
      saved = localStorage.getItem("smartplay_player_fit_mode") || "fit";
    } catch (error) {}
    applyPlayerFitMode(saved);
  }

  function stopPlayer() {
    var video = document.getElementById("video");
    if (!video) return;

    hideEpisodeActionButtons();

    if (playerUiTimer) {
      clearTimeout(playerUiTimer);
      playerUiTimer = null;
    }
    var topbar = document.querySelector(".player-topbar");
    if (topbar) topbar.classList.remove("ui-hidden");

    if (playbackWatchdog) {
      clearInterval(playbackWatchdog);
      playbackWatchdog = null;
    }
    if (recoveryTimeout) {
      clearTimeout(recoveryTimeout);
      recoveryTimeout = null;
    }
    lastPlaybackTime = -1;
    lastPlaybackAdvanceAt = 0;
    autoRecoveryInProgress = false;
    playerHasStarted = false;
    suppressLoadingOverlay = false;

    if (fullHls) {
      try { fullHls.destroy(); } catch (error) {}
      fullHls = null;
    }

    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (error) {}
  }

  function stopPreview() {
    var video = document.getElementById("previewVideo");
    var media = document.getElementById("previewMedia");
    if (!video) return;

    if (previewHls) {
      try { previewHls.destroy(); } catch (error) {}
      previewHls = null;
    }

    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (error) {}

    if (media) media.classList.remove("is-playing");
  }

  function setPlayerLoading(active, text) {
    var loading = document.getElementById("playerLoading");
    if (!loading) return;
    loading.classList.toggle("active", !!active);
    var label = loading.querySelector("b");
    if (label && text) label.textContent = text;
  }

  function setPlayerError(message) {
    var box = document.getElementById("playerError");
    if (!box) return;

    var label = box.querySelector("b");
    if (label) {
      label.textContent =
        message || "Não foi possível reproduzir este conteúdo.";
    }

    box.classList.add("active");
    setPlayerLoading(false);
  }

  function clearPlayerError() {
    var box = document.getElementById("playerError");
    if (box) box.classList.remove("active");
  }

  function playbackKeyForItem(item) {
    if (!item || item.type === "live") return "";
    if (item.type === "series" && item.url) {
      return "episode:" + item.url;
    }
    return favoriteKey(item);
  }

  function updatePlayerSwitcher() {
    var item = catalog[currentPlayingIndex];
    var prev = document.getElementById("playerPrev");
    var next = document.getElementById("playerNext");

    var isLive = !!item && item.type === "live";
    if (prev) prev.style.display = isLive ? "" : "none";
    if (next) next.style.display = isLive ? "" : "none";

    var kind = document.getElementById("playerKind");
    if (kind) {
      kind.textContent = isLive
        ? "TV AO VIVO"
        : item && item.type === "movie"
        ? "FILME"
        : "EPISÓDIO";
    }
  }

  function playNeighbor(direction) {
    var current = catalog[currentPlayingIndex];
    if (!current || current.type !== "live") return;

    var liveItems = itemsFor("live");
    var position = liveItems.indexOf(current);
    if (position < 0 || !liveItems.length) return;

    var nextPosition =
      (position + direction + liveItems.length) % liveItems.length;
    var nextIndex = catalogIndexOf(liveItems[nextPosition]);

    if (nextIndex >= 0) {
      selectedCatalogIndex = nextIndex;
      play(nextIndex);
    }
  }

  function restoreSelectedFocus() {
    if (selectedCatalogIndex < 0) return false;
    var row = document.querySelector(
      '[data-catalog-index="' + selectedCatalogIndex + '"]'
    );
    if (row) {
      row.focus();
      return true;
    }
    return false;
  }

  function show(id, push) {
    if (id !== "player") stopPlayer();
    if (id !== "channels") stopPreview();

    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.classList.remove("active");
    });

    var target = document.getElementById(id);
    if (target) target.classList.add("active");

    if (push !== false && historyStack[historyStack.length - 1] !== id) {
      historyStack.push(id);
    }

    setTimeout(focusFirst, 20);
  }

  function focusFirst() {
    var active = document.querySelector(".screen.active");
    if (!active) return;

    if (active.id === "channels" && restoreSelectedFocus()) {
      return;
    }

    var first =
      active.id === "channels"
        ? active.querySelector(".category-button")
        : active.querySelector(".focusable");

    if (first) first.focus();
  }

  function pairCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 6; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function attr(line, key) {
    var match = line.match(new RegExp(key + '="([^"]*)"', "i"));
    return match ? match[1] : "";
  }

  function normalizedText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function inferType(item) {
    var text = normalizedText((item.group || "") + " " + (item.name || ""));
    var url = normalizedText(item.url || "");
    var looksLive = /\.m3u8(\?|$)/.test(url) || /\.ts(\?|$)/.test(url);
    var staticVideo = /\.(mp4|mkv|avi|mov|webm)(\?|$)/.test(url);

    if (
      /\/series\//.test(url) ||
      /(^|[^a-z0-9])s\d{1,2}e\d{1,3}([^a-z0-9]|$)/.test(text) ||
      /(^|[^a-z0-9])\d{1,2}x\d{1,3}([^a-z0-9]|$)/.test(text) ||
      (!looksLive &&
        /(serie|series|seriado|seriados|temporada|temporadas|episodio|episodios|season|episode)/.test(text))
    ) {
      return "series";
    }

    if (
      /\/(movie|vod)\//.test(url) ||
      staticVideo ||
      (!looksLive && /(filme|filmes|movie|movies|cinema|vod)/.test(text))
    ) {
      return "movie";
    }

    return "live";
  }

  function parseM3U(text) {
    var lines = text.replace(/\r/g, "").split("\n");
    var parsed = [];
    var meta = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (line.indexOf("#EXTINF:") === 0) {
        var comma = line.indexOf(",");
        meta = {
          name: comma >= 0 ? line.slice(comma + 1).trim() : "Conteúdo",
          group: attr(line, "group-title") || "Outros",
          logo: attr(line, "tvg-logo") || "",
          tvgId: attr(line, "tvg-id") || "",
          tvgName: attr(line, "tvg-name") || ""
        };
      } else if (line.charAt(0) !== "#" && meta) {
        meta.url = line;
        meta.type = inferType(meta);
        parsed.push(meta);
        meta = null;
      }
    }

    return parsed;
  }

  function yieldToUi() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  async function parseM3UAsync(text, onProgress) {
    var lines = text.replace(/\r/g, "").split("\n");
    var parsed = [];
    var meta = null;
    var chunkSize = 3500;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line) {
        if (line.indexOf("#EXTINF:") === 0) {
          var comma = line.indexOf(",");
          meta = {
            name: comma >= 0 ? line.slice(comma + 1).trim() : "Conteúdo",
            group: attr(line, "group-title") || "Outros",
            logo: attr(line, "tvg-logo") || "",
            tvgId: attr(line, "tvg-id") || "",
            tvgName: attr(line, "tvg-name") || ""
          };
        } else if (line.charAt(0) !== "#" && meta) {
          meta.url = line;
          meta.type = inferType(meta);
          parsed.push(meta);
          meta = null;
        }
      }

      if (i > 0 && i % chunkSize === 0) {
        if (onProgress) {
          onProgress(Math.round((i / lines.length) * 100));
        }
        await yieldToUi();
      }
    }

    if (onProgress) onProgress(100);
    return parsed;
  }

  function parseEpgUrl(text) {
    var firstLine = String(text || "").replace(/\r/g, "").split("\n")[0] || "";
    return (
      attr(firstLine, "url-tvg") ||
      attr(firstLine, "x-tvg-url") ||
      attr(firstLine, "tvg-url") ||
      ""
    );
  }

  async function fetchTextThroughBackend(url) {
    var response = await fetch(REMOTE_PROXY_BASE + "/api/fetch-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    });

    var result = await response.json();
    if (!response.ok || !result.ok) {
      var error = new Error(
        result && result.status
          ? "HTTP " + result.status
          : result && result.error
          ? result.error
          : "falha no backend"
      );
      error.remoteStatus = result && result.status;
      throw error;
    }

    return result.content || "";
  }

  async function fetchRemoteText(url) {
    try {
      var direct = await fetch(url, { method: "GET", cache: "no-store" });
      if (!direct.ok) {
        var directError = new Error("HTTP " + direct.status);
        directError.remoteStatus = direct.status;
        throw directError;
      }
      return await direct.text();
    } catch (directError) {
      return fetchTextThroughBackend(url);
    }
  }

  async function probeRemoteUrl(url) {
    var response = await fetch(REMOTE_PROXY_BASE + "/api/probe-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    });

    var result = await response.json();
    if (!response.ok || !result.ok) {
      var error = new Error(
        result && result.status
          ? "HTTP " + result.status
          : result && result.error
          ? result.error
          : "falha no teste"
      );
      error.remoteStatus = result && result.status;
      throw error;
    }

    return result;
  }

  function normalizeServer(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function getXtreamSession(id) {
    if (xtreamSessions[id]) return xtreamSessions[id];

    try {
      var raw = sessionStorage.getItem("smartplay_xtream_" + id);
      if (raw) {
        xtreamSessions[id] = JSON.parse(raw);
        return xtreamSessions[id];
      }
    } catch (error) {}

    return null;
  }

  function saveXtreamSession(id, data) {
    xtreamSessions[id] = data;
    try {
      sessionStorage.setItem("smartplay_xtream_" + id, JSON.stringify(data));
    } catch (error) {}
  }

  function removeXtreamSession(id) {
    delete xtreamSessions[id];
    try {
      sessionStorage.removeItem("smartplay_xtream_" + id);
    } catch (error) {}
  }

  function categoryMap(items) {
    var map = {};
    (items || []).forEach(function (item) {
      if (item && item.category_id != null) {
        map[String(item.category_id)] = item.category_name || "Outros";
      }
    });
    return map;
  }

  function catalogIndexOf(item) {
    if (!item) return -1;
    if (
      typeof item.__smartIndex === "number" &&
      catalog[item.__smartIndex] === item
    ) {
      return item.__smartIndex;
    }
    return catalog.indexOf(item);
  }

  function indexCatalogItems() {
    m3uSeriesGroupCache = null;
    m3uSeriesGroupCacheKey = "";

    for (var i = 0; i < catalog.length; i++) {
      try {
        Object.defineProperty(catalog[i], "__smartIndex", {
          value: i,
          writable: true,
          configurable: true,
          enumerable: false
        });
      } catch (error) {
        catalog[i].__smartIndex = i;
      }
    }
  }

  function itemsFor(type) {
    return catalog.filter(function (item) {
      return item.type === type;
    });
  }

  function browseTitle(type) {
    if (type === "movie") return "Filmes";
    if (type === "series") return "Séries";
    return "TV ao Vivo";
  }

  function categoryCounts(items) {
    var counts = {};
    items.forEach(function (item) {
      var group = item.group || "Outros";
      counts[group] = (counts[group] || 0) + 1;
    });
    return counts;
  }

  function setEpgText(nowText, nextText, startTime, stopTime) {
    document.getElementById("epgNow").textContent =
      nowText || "Programação não disponível";
    document.getElementById("epgNext").textContent = nextText || "—";

    var meta = document.getElementById("epgMeta");
    var progress = document.getElementById("epgProgress");
    var startMs = startTime instanceof Date ? startTime.getTime() : Number(startTime || 0);
    var stopMs = stopTime instanceof Date ? stopTime.getTime() : Number(stopTime || 0);

    if (meta) {
      if (startMs && stopMs && stopMs > startMs) {
        var startLabel = new Date(startMs).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        });
        var stopLabel = new Date(stopMs).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        });
        meta.textContent = startLabel + " - " + stopLabel;
      } else {
        meta.textContent = "";
      }
    }

    if (progress) {
      var percent = 0;
      if (startMs && stopMs && stopMs > startMs) {
        percent = Math.max(
          0,
          Math.min(100, ((Date.now() - startMs) / (stopMs - startMs)) * 100)
        );
      }
      progress.style.width = percent.toFixed(1) + "%";
    }
  }

  function parseXmltvDate(value) {
    var match = String(value || "").match(
      /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/
    );
    if (!match) return null;

    var utc = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    );

    if (match[7]) {
      var sign = match[7].charAt(0) === "-" ? -1 : 1;
      var hours = Number(match[7].slice(1, 3));
      var minutes = Number(match[7].slice(3, 5));
      utc -= sign * (hours * 60 + minutes) * 60000;
    }

    return new Date(utc);
  }

  function formatProgramme(programme) {
    if (!programme) return "";
    var titleNode = programme.getElementsByTagName("title")[0];
    var title = titleNode ? titleNode.textContent.trim() : "Sem título";
    var start = parseXmltvDate(programme.getAttribute("start"));
    var time = start
      ? start.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : "";
    return (time ? time + " • " : "") + title;
  }

  async function getEpgDocument(playlist) {
    if (!playlist || !playlist.epgUrl) return null;
    if (epgCache[playlist.id]) return epgCache[playlist.id];

    epgCache[playlist.id] = fetchRemoteText(playlist.epgUrl)
      .then(function (xmlText) {
        var doc = new DOMParser().parseFromString(xmlText, "application/xml");
        if (doc.getElementsByTagName("parsererror").length) {
          throw new Error("EPG inválido");
        }
        return doc;
      })
      .catch(function () {
        return null;
      });

    trimCache(epgCache, 2);
    return epgCache[playlist.id];
  }

  function decodeXtreamText(value) {
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(atob(String(value || "")), function (char) {
            return "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
    } catch (error) {
      return String(value || "");
    }
  }

  async function loadXtreamEpg(item, playlist) {
    var session = getXtreamSession(playlist.id);
    if (!session || !item.streamId) return false;

    var url =
      session.server +
      "/player_api.php?username=" +
      encodeURIComponent(session.username) +
      "&password=" +
      encodeURIComponent(session.password) +
      "&action=get_short_epg&stream_id=" +
      encodeURIComponent(item.streamId) +
      "&limit=4";

    try {
      var cacheKey = playlist.id + ":" + item.streamId;
      var cached = shortEpgCache[cacheKey];
      var listings = null;

      if (cached && Date.now() - cached.savedAt < 120000) {
        listings = cached.listings;
      } else {
        var text = await fetchRemoteText(url);
        var data = JSON.parse(text);
        listings =
          data && Array.isArray(data.epg_listings) ? data.epg_listings : [];
        shortEpgCache[cacheKey] = {
          savedAt: Date.now(),
          listings: listings
        };
        trimCache(shortEpgCache, 30);
      }

      if (!listings.length) return false;

      var nowSeconds = Math.floor(Date.now() / 1000);
      var current = null;
      var next = null;

      listings.forEach(function (listing) {
        var start = Number(listing.start_timestamp || 0);
        var stop = Number(listing.stop_timestamp || 0);

        if (start <= nowSeconds && (!stop || nowSeconds < stop)) {
          current = listing;
        } else if (start > nowSeconds && (!next || start < Number(next.start_timestamp || 0))) {
          next = listing;
        }
      });

      function label(listing) {
        if (!listing) return "";
        var start = Number(listing.start_timestamp || 0);
        var time = start
          ? new Date(start * 1000).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit"
            })
          : "";
        var title = decodeXtreamText(listing.title || "");
        return (time ? time + " • " : "") + (title || "Sem título");
      }

      if (catalog[selectedCatalogIndex] !== item) return true;

      setEpgText(
        label(current),
        label(next),
        current ? Number(current.start_timestamp || 0) * 1000 : 0,
        current ? Number(current.stop_timestamp || 0) * 1000 : 0
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  async function loadEpgForItem(item) {
    setEpgText("", "");

    if (!item || item.type !== "live") return;

    var playlist = activePlaylist();
    if (!playlist) return;

    document.getElementById("epgNow").textContent = "Carregando programação...";

    if (playlist.type === "xtream") {
      var xtreamLoaded = await loadXtreamEpg(item, playlist);
      if (!xtreamLoaded && catalog[selectedCatalogIndex] === item) {
        setEpgText("", "");
      }
      return;
    }

    if (playlist.type !== "m3u" || !playlist.epgUrl || !item.tvgId) {
      setEpgText("", "");
      return;
    }

    var doc = await getEpgDocument(playlist);
    if (!doc || selectedCatalogIndex < 0 || catalog[selectedCatalogIndex] !== item) {
      setEpgText("", "");
      return;
    }

    var now = new Date();
    var current = null;
    var next = null;
    var programmes = doc.getElementsByTagName("programme");

    for (var i = 0; i < programmes.length; i++) {
      var programme = programmes[i];
      if (programme.getAttribute("channel") !== item.tvgId) continue;

      var start = parseXmltvDate(programme.getAttribute("start"));
      var stop = parseXmltvDate(programme.getAttribute("stop"));
      if (!start) continue;

      if (start <= now && (!stop || now < stop)) {
        current = programme;
      } else if (
        start > now &&
        (!next || start < parseXmltvDate(next.getAttribute("start")))
      ) {
        next = programme;
      }
    }

    setEpgText(
      formatProgramme(current),
      formatProgramme(next),
      current ? parseXmltvDate(current.getAttribute("start")) : null,
      current ? parseXmltvDate(current.getAttribute("stop")) : null
    );
  }

  function resetPreview() {
    stopPreview();
    selectedCatalogIndex = -1;
    document.getElementById("previewTitle").textContent = "Selecione um item";
    document.getElementById("previewGroup").textContent =
      "Escolha uma categoria e um conteúdo para ver os detalhes.";
    document.getElementById("previewKind").textContent = "SMART PLAY TV";
    document.getElementById("previewLogo").innerHTML = "<span>▶</span>";
    document.getElementById("previewState").textContent = "Selecione um canal";
    document.getElementById("previewSelected").disabled = true;
    document.getElementById("playSelected").disabled = true;
    updateFavoriteButton(null);
    document.getElementById("epgBox").style.display =
      browseType === "live" ? "" : "none";
    setEpgText("", "");
  }

  function selectCatalogItem(index) {
    var item = catalog[index];
    if (!item) return;

    if (selectedCatalogIndex !== index) stopPreview();
    selectedCatalogIndex = index;

    document.querySelectorAll(".content-row").forEach(function (row) {
      row.classList.toggle(
        "selected-item",
        Number(row.dataset.catalogIndex) === index
      );
    });

    document.getElementById("previewTitle").textContent = item.name || "Conteúdo";
    var detailParts = [item.group || "Sem categoria"];
    if (item.year) detailParts.push(String(item.year));
    if (item.rating) detailParts.push("★ " + String(item.rating));
    if (item.plot) {
      detailParts.push(
        String(item.plot).length > 160
          ? String(item.plot).slice(0, 157) + "..."
          : String(item.plot)
      );
    }
    document.getElementById("previewGroup").textContent =
      detailParts.join(" • ");
    document.getElementById("previewKind").textContent =
      browseType === "movie"
        ? "FILME"
        : browseType === "series"
        ? "SÉRIE"
        : "TV AO VIVO";

    var logo = document.getElementById("previewLogo");
    if (item.logo) {
      logo.innerHTML =
        '<img src="' + esc(item.logo) + '" alt="' + esc(item.name) + '">';
    } else {
      logo.innerHTML = "<span>▶</span>";
    }

    document.getElementById("previewState").textContent =
      item.type === "live"
        ? "OK para pré-visualizar"
        : item.type === "movie"
        ? "Filme selecionado"
        : "Clique na capa para abrir temporadas";
    document.getElementById("previewSelected").disabled = item.type === "series";
    document.getElementById("playSelected").disabled = item.type === "series";
    updateFavoriteButton(item);
    document.getElementById("epgBox").style.display =
      item.type === "live" ? "" : "none";
    loadEpgForItem(item);
  }

  function visibleBrowseItems() {
    var items = itemsFor(browseType);

    if (browseCategory === "__favorites__") {
      items = items.filter(function (item) {
        return isFavorite(item);
      });
    }

    if (browseCategory === "__continue__") {
      items = items.filter(function (item) {
        if (item.type === "movie") {
          return isProgressContinuable(
            readProgress(playbackKeyForItem(item))
          );
        }
        if (item.type === "series") {
          return seriesIsContinuable(item);
        }
        return false;
      });
    }

    if (
      browseCategory &&
      browseCategory !== "__favorites__" &&
      browseCategory !== "__continue__"
    ) {
      items = items.filter(function (item) {
        return (item.group || "Outros") === browseCategory;
      });
    }

    if (browseSearch) {
      var query = normalizedText(browseSearch);
      items = items.filter(function (item) {
        return normalizedText(
          (item.name || "") + " " + (item.group || "")
        ).indexOf(query) >= 0;
      });
    }

    return items;
  }

  function renderCategories() {
    var allItems = itemsFor(browseType);
    var counts = categoryCounts(allItems);
    var list = document.getElementById("categoryList");

    document.getElementById("allCount").textContent = String(allItems.length);
    document.getElementById("favoriteCount").textContent = String(favoriteCountForType(browseType));
    var continueButton = document.getElementById("continueCategory");
    var continueCount = document.getElementById("continueCount");
    if (continueButton) {
      continueButton.style.display = browseType === "live" ? "none" : "";
    }
    if (continueCount) {
      continueCount.textContent = String(continueCountForType(browseType));
    }
    list.innerHTML = "";

    Object.keys(counts)
      .sort(function (a, b) {
        return a.localeCompare(b, "pt-BR");
      })
      .forEach(function (group) {
        var button = document.createElement("button");
        button.className =
          "focusable category-item" +
          (browseCategory === group ? " active-category" : "");
        button.innerHTML =
          "<span>•</span><b>" + esc(group) + "</b><em>" + counts[group] + "</em>";
        button.onclick = function () {
          browseCategory = group;
          browseSearch = "";
          document.getElementById("browserSearch").value = "";
          document.getElementById("searchBox").classList.remove("active");
          renderBrowserContents();
        };
        list.appendChild(button);
      });

    document.querySelector('[data-action="categoryAll"]').classList.toggle(
      "active-category",
      browseCategory === ""
    );
    document.querySelector('[data-action="categoryFavorites"]').classList.toggle(
      "active-category",
      browseCategory === "__favorites__"
    );
    var continueCategoryButton = document.querySelector(
      '[data-action="categoryContinue"]'
    );
    if (continueCategoryButton) {
      continueCategoryButton.classList.toggle(
        "active-category",
        browseCategory === "__continue__"
      );
    }
  }

  function episodeMeta(name) {
    var raw = String(name || "");
    var normalized = normalizedText(raw);
    var match =
      normalized.match(/(?:^|[^a-z0-9])s(\d{1,2})e(\d{1,3})(?:[^a-z0-9]|$)/i) ||
      normalized.match(/(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?:[^a-z0-9]|$)/i);

    if (!match) {
      return {
        seriesName: raw,
        season: 1,
        episode: 0,
        episodeTitle: raw
      };
    }

    var seriesName = raw
      .replace(/\s*[-_.|]*\s*(S\d{1,2}E\d{1,3}|\d{1,2}x\d{1,3}).*$/i, "")
      .trim();

    return {
      seriesName: seriesName || raw,
      season: Number(match[1] || 1),
      episode: Number(match[2] || 0),
      episodeTitle: raw
    };
  }

  function m3uSeriesGroups(items) {
    var cacheKey =
      activePlaylistId +
      ":" +
      catalog.length +
      ":" +
      items.length +
      ":" +
      (browseCategory || "") +
      ":" +
      (browseSearch || "");

    if (
      m3uSeriesGroupCache &&
      m3uSeriesGroupCacheKey === cacheKey
    ) {
      return m3uSeriesGroupCache;
    }

    var map = {};
    var groups = [];

    items.forEach(function (item) {
      var index = catalogIndexOf(item);
      var meta = episodeMeta(item.name);
      var key = normalizedText(meta.seriesName || item.name);

      if (!map[key]) {
        map[key] = {
          name: meta.seriesName || item.name,
          group: item.group || "Séries",
          logo: item.logo || "",
          indexes: []
        };
        groups.push(map[key]);
      }

      map[key].indexes.push(index);
      if (!map[key].logo && item.logo) map[key].logo = item.logo;
    });

    m3uSeriesGroupCacheKey = cacheKey;
    m3uSeriesGroupCache = groups;
    return groups;
  }

  function setBrowseRenderState(mode, entries) {
    browseRenderMode = mode;
    browseRenderEntries = entries || [];
    browseRenderedCount = 0;
    browseRenderBusy = false;
  }

  function appendLiveRows(grid) {
    if (browseRenderBusy || browseRenderMode !== "live") return;
    if (browseRenderedCount >= browseRenderEntries.length) return;

    browseRenderBusy = true;
    var start = browseRenderedCount;
    var end = Math.min(
      browseRenderEntries.length,
      start + LIVE_RENDER_BATCH
    );
    var fragment = document.createDocumentFragment();

    for (var visibleIndex = start; visibleIndex < end; visibleIndex++) {
      (function (item, itemPosition) {
        var index = catalogIndexOf(item);
        var button = document.createElement("button");
        var logoHtml = item.logo
          ? '<img class="content-logo" loading="lazy" decoding="async" src="' +
            esc(item.logo) +
            '" alt="">'
          : '<span class="content-logo-fallback">TV</span>';

        button.className =
          "focusable content-row" +
          (selectedCatalogIndex === index ? " selected-item" : "");
        button.dataset.catalogIndex = String(index);
        button.dataset.visibleIndex = String(itemPosition);
        button.innerHTML =
          '<span class="content-number">' +
          String(itemPosition + 1).padStart(2, "0") +
          "</span>" +
          logoHtml +
          '<span class="content-info"><strong>' +
          esc(item.name) +
          "</strong><span>" +
          esc(item.group || "Outros") +
          '</span></span><span class="content-chevron">' +
          (isFavorite(item) ? "★" : "›") +
          "</span>";

        button.onfocus = function () {
          if (itemPosition >= browseRenderedCount - 10) {
            appendLiveRows(grid);
          }
        };

        button.onclick = function () {
          if (selectedCatalogIndex === index) {
            play(index);
            return;
          }

          selectCatalogItem(index);
          preview(index);
        };

        fragment.appendChild(button);
      })(browseRenderEntries[visibleIndex], visibleIndex);
    }

    grid.appendChild(fragment);
    browseRenderedCount = end;
    browseRenderBusy = false;
  }

  function appendMediaCards(grid) {
    if (browseRenderBusy || browseRenderMode !== "media") return;
    if (browseRenderedCount >= browseRenderEntries.length) return;

    browseRenderBusy = true;
    var start = browseRenderedCount;
    var end = Math.min(
      browseRenderEntries.length,
      start + MEDIA_RENDER_BATCH
    );
    var fragment = document.createDocumentFragment();

    for (var position = start; position < end; position++) {
      (function (entry, itemPosition) {
        var index =
          entry.index != null
            ? entry.index
            : entry.indexes && entry.indexes.length
            ? entry.indexes[0]
            : -1;

        var poster = entry.logo
          ? '<img loading="lazy" decoding="async" src="' +
            esc(entry.logo) +
            '" alt="">'
          : "<span>" + (browseType === "movie" ? "F" : "S") + "</span>";
        var progress = 0;
        if (browseType === "movie" && index >= 0) {
          progress = progressPercent(playbackKeyForItem(catalog[index]));
        } else if (browseType === "series" && index >= 0) {
          var seriesResume = readSeriesResume(
            seriesKeyFromItem(catalog[index])
          );
          if (seriesResume && seriesResume.duration > 0) {
            progress = Math.max(
              0,
              Math.min(
                100,
                Math.round(
                  (seriesResume.currentTime / seriesResume.duration) * 100
                )
              )
            );
          }
        }
        var favoriteBadge =
          index >= 0 && isFavorite(catalog[index])
            ? '<span class="media-favorite-badge">★</span>'
            : "";

        var button = document.createElement("button");
        button.className = "focusable media-card";
        button.dataset.catalogIndex = String(index);
        button.dataset.visibleIndex = String(itemPosition);
        button.innerHTML =
          '<div class="media-poster">' +
          poster +
          favoriteBadge +
          '</div><div class="media-card-info"><strong>' +
          esc(entry.name) +
          "</strong><small>" +
          esc(entry.group || "Outros") +
          "</small>" +
          (progress > 0
            ? '<div class="progress-track"><i style="width:' +
              progress +
              '%"></i></div>'
            : "") +
          "</div>";

        button.onfocus = function () {
          if (index >= 0) {
            selectCatalogItem(index);
            if (browseType === "series") {
              scheduleXtreamSeriesPrefetch(index);
            }
          }
          if (itemPosition >= browseRenderedCount - 8) {
            appendMediaCards(grid);
          }
        };

        button.onclick = function () {
          if (browseType === "movie") {
            if (index >= 0) openMovieDetail(index);
          } else if (browseType === "series") {
            openSeries(index, entry.indexes || null);
          }
        };

        fragment.appendChild(button);
      })(browseRenderEntries[position], position);
    }

    grid.appendChild(fragment);
    browseRenderedCount = end;
    browseRenderBusy = false;
  }

  function bindProgressiveBrowseScroll() {
    var grid = document.getElementById("channelGrid");
    if (!grid || grid.dataset.progressiveBound === "1") return;

    grid.dataset.progressiveBound = "1";
    grid.addEventListener("scroll", function () {
      if (grid.scrollTop + grid.clientHeight < grid.scrollHeight - 280) return;

      if (browseRenderMode === "live") {
        appendLiveRows(grid);
      } else if (browseRenderMode === "media") {
        appendMediaCards(grid);
      }
    });
  }

  function renderMediaContents(grid, items) {
    var current = activePlaylist();
    var displayItems;

    if (browseType === "series" && current && current.type === "m3u") {
      displayItems = m3uSeriesGroups(items);
    } else {
      displayItems = items.map(function (item) {
        return {
          name: item.name,
          group: item.group,
          logo: item.logo,
          index: catalogIndexOf(item)
        };
      });
    }

    document.getElementById("currentCategoryLabel").textContent =
      browseCategory === "__favorites__"
        ? "Favoritos"
        : browseCategory === "__continue__"
        ? "Continuar assistindo"
        : browseCategory || (browseSearch ? "Busca" : "Todos");
    document.getElementById("itemCount").textContent =
      displayItems.length + (displayItems.length === 1 ? " item" : " itens");

    grid.classList.add("media-grid");
    grid.innerHTML = "";

    if (!displayItems.length) {
      setBrowseRenderState("media", []);
      grid.innerHTML =
        '<div class="browser-empty">Nenhum conteúdo encontrado nesta categoria.</div>';
      return;
    }

    setBrowseRenderState("media", displayItems);
    grid.scrollTop = 0;
    appendMediaCards(grid);
  }

  function renderBrowserContents() {
    var grid = document.getElementById("channelGrid");
    var items = visibleBrowseItems();

    renderCategories();

    var keepLiveSelection =
      browseType === "live" &&
      selectedCatalogIndex >= 0 &&
      catalog[selectedCatalogIndex] &&
      catalog[selectedCatalogIndex].type === "live";

    if (!keepLiveSelection) {
      resetPreview();
    }

    if (browseType !== "live") {
      renderMediaContents(grid, items);
      return;
    }

    grid.classList.remove("media-grid");

    document.getElementById("currentCategoryLabel").textContent =
      browseCategory === "__favorites__"
        ? "Favoritos"
        : browseCategory === "__continue__"
        ? "Continuar assistindo"
        : browseCategory || (browseSearch ? "Busca" : "Todos");
    document.getElementById("itemCount").textContent =
      items.length + (items.length === 1 ? " item" : " itens");

    grid.innerHTML = "";

    if (!items.length) {
      setBrowseRenderState("live", []);
      var message = "Nenhum conteúdo encontrado.";
      if (browseCategory === "__favorites__") {
        message = "Você ainda não adicionou favoritos.";
      } else if (browseCategory === "__continue__") {
        message = "Não há nada para continuar assistindo.";
      } else if (!browseSearch && !browseCategory) {
        message =
          browseType === "movie"
            ? "Esta playlist não contém filmes identificados."
            : browseType === "series"
            ? "Esta playlist não contém séries identificadas."
            : "Esta playlist não contém canais ao vivo.";
      }

      grid.innerHTML = '<div class="browser-empty">' + message + "</div>";
      return;
    }

    setBrowseRenderState("live", items);
    grid.scrollTop = 0;
    appendLiveRows(grid);
  }

  function renderBrowser(type) {
    browseType = type;
    browseCategory = "";
    browseSearch = "";

    if (type === "live") {
      var rememberedIndex = findLastLiveIndex();
      if (rememberedIndex >= 0) selectedCatalogIndex = rememberedIndex;
    }

    var title = browseTitle(type);
    var browserScreen = document.getElementById("channels");
    if (browserScreen) browserScreen.classList.toggle("live-browser", type === "live");
    document.getElementById("browserTitle").textContent = title;
    document.getElementById("browserSearch").value = "";
    document.getElementById("searchBox").classList.remove("active");

    var current = activePlaylist();
    document.getElementById("activeSourceLabel").textContent = current
      ? "Playlist: " + current.name
      : "Nenhuma playlist ativa";

    renderBrowserContents();

    if (type === "live" && rememberedIndex >= 0) {
      var rememberedRow = document.querySelector(
        '.content-row[data-catalog-index="' + rememberedIndex + '"]'
      );
      if (rememberedRow) {
        selectCatalogItem(rememberedIndex);
      }
    }
  }

  function openMovieDetail(index) {
    var item = catalog[index];
    if (!item || item.type !== "movie") return;

    currentMovieIndex = index;

    document.getElementById("movieDetailTitle").textContent =
      item.name || "Filme";
    document.getElementById("movieDetailName").textContent =
      item.name || "Filme";
    document.getElementById("movieDetailGroup").textContent =
      item.group || "Filmes";

    var meta = [];
    if (item.year) meta.push(String(item.year));
    if (item.rating) meta.push("★ " + String(item.rating));
    document.getElementById("movieDetailMeta").textContent =
      meta.join(" • ");
    document.getElementById("movieDetailPlot").textContent =
      item.plot || "Sinopse não disponível para este conteúdo.";

    var poster = document.getElementById("movieDetailPoster");
    poster.innerHTML = item.logo
      ? '<img loading="lazy" decoding="async" src="' +
        esc(item.logo) +
        '" alt="">'
      : "<span>F</span>";

    var key = playbackKeyForItem(item);
    var progress = readProgress(key);
    var percent = progressPercent(key);
    var progressText = document.getElementById("movieDetailProgressText");
    var progressBar = document.getElementById("movieDetailProgress");
    var playButton = document.getElementById("movieDetailPlay");
    var favoriteButton = document.getElementById("movieDetailFavorite");

    if (progressBar) progressBar.style.width = percent + "%";

    if (progress && progress.watched) {
      progressText.textContent = "Assistido";
      playButton.textContent = "↻ Assistir novamente";
    } else if (isProgressContinuable(progress)) {
      progressText.textContent = percent + "% assistido";
      playButton.textContent = "▶ Continuar";
    } else {
      progressText.textContent = "Ainda não iniciado";
      playButton.textContent = "▶ Assistir";
    }

    if (favoriteButton) {
      var favorite = isFavorite(item);
      favoriteButton.classList.toggle("is-favorite", favorite);
      favoriteButton.textContent = favorite ? "★ Favorito" : "☆ Favoritar";
    }

    show("movieDetail");
  }

  function refreshMovieDetail() {
    if (currentMovieIndex >= 0) {
      var active = document.getElementById("movieDetail");
      if (active && active.classList.contains("active")) {
        openMovieDetail(currentMovieIndex);
      }
    }
  }

  function setSeriesHero(name, group, cover, meta, plot) {
    document.getElementById("seriesDetailTitle").textContent = name || "Série";
    document.getElementById("seriesDetailName").textContent = name || "Série";
    document.getElementById("seriesDetailGroup").textContent =
      group || "Séries";
    document.getElementById("seriesDetailMeta").textContent = meta || "";
    document.getElementById("seriesDetailPlot").textContent = plot || "";

    var coverBox = document.getElementById("seriesDetailCover");
    coverBox.innerHTML = cover
      ? '<img loading="lazy" decoding="async" src="' + esc(cover) + '" alt="">'
      : "<span>S</span>";
  }

  function renderSeasonTabs() {
    var tabs = document.getElementById("seasonTabs");
    var seasons = Object.keys(currentSeriesSeasons).sort(function (a, b) {
      return Number(a) - Number(b);
    });

    tabs.innerHTML = "";
    document.getElementById("seriesEpisodeCount").textContent =
      seasons.reduce(function (total, season) {
        return total + currentSeriesSeasons[season].length;
      }, 0) + " episódios";

    seasons.forEach(function (season) {
      var button = document.createElement("button");
      button.className =
        "focusable season-tab" +
        (String(currentSeriesSeason) === String(season)
          ? " active-season"
          : "");
      button.textContent = "Temporada " + season;
      button.onclick = function () {
        currentSeriesSeason = season;
        rememberSeriesSeason(season);
        renderSeasonTabs();
        renderEpisodes();
      };
      tabs.appendChild(button);
    });
  }

  function appendEpisodeRows(list) {
    if (episodeRenderBusy) return;
    if (episodeRenderedCount >= episodeRenderEntries.length) return;

    episodeRenderBusy = true;

    var start = episodeRenderedCount;
    var end = Math.min(
      episodeRenderEntries.length,
      start + EPISODE_RENDER_BATCH
    );
    var fragment = document.createDocumentFragment();

    for (var i = start; i < end; i++) {
      (function (episode, position) {
        var episodeKey = episodePlaybackKey(episode);
        var episodeProgressData = readProgress(episodeKey);
        var episodeProgress = progressPercent(episodeKey);
        var episodeWatched = !!(
          episodeProgressData && episodeProgressData.watched
        );

        var button = document.createElement("button");
        button.className =
          "focusable episode-row" + (episodeWatched ? " watched" : "");
        button.dataset.season = String(episode.season || 1);
        button.dataset.episode = String(episode.episode || 1);
        button.dataset.episodePosition = String(position);
        button.innerHTML =
          '<span class="episode-number">E' +
          String(episode.episode || 0).padStart(2, "0") +
          '</span><span class="episode-info"><strong>' +
          esc(episode.title || "Episódio") +
          "</strong><span>Temporada " +
          esc(episode.season) +
          " • Episódio " +
          esc(episode.episode || "?") +
          "</span>" +
          (episodeProgress > 0
            ? '<div class="episode-progress"><i style="width:' +
              episodeProgress +
              '%"></i></div>'
            : "") +
          '</span><span class="episode-play">' +
          (episodeWatched ? "✓ Assistido" : "▶") +
          "</span>";

        button.onfocus = function () {
          selectedEpisodeForActions = episode;
          updateSeriesHeroActions();

          if (position >= episodeRenderedCount - 6) {
            appendEpisodeRows(list);
          }
        };

        button.onclick = function () {
          playSeriesEpisode(episode);
        };

        fragment.appendChild(button);
      })(episodeRenderEntries[i], i);
    }

    list.appendChild(fragment);
    episodeRenderedCount = end;
    episodeRenderBusy = false;
  }

  function renderEpisodes() {
    var list = document.getElementById("episodeList");
    var episodes =
      currentSeriesSeasons[String(currentSeriesSeason)] || [];

    list.innerHTML = "";
    list.scrollTop = 0;
    episodeRenderedCount = 0;
    episodeRenderBusy = false;
    episodeRenderEntries = episodes
      .slice()
      .sort(function (a, b) {
        return Number(a.episode || 0) - Number(b.episode || 0);
      });

    if (!episodeRenderEntries.length) {
      list.innerHTML =
        '<div class="series-empty">Nenhum episódio encontrado nesta temporada.</div>';
      return;
    }

    if (list.dataset.progressiveBound !== "1") {
      list.dataset.progressiveBound = "1";
      list.addEventListener("scroll", function () {
        if (
          list.scrollTop + list.clientHeight >=
          list.scrollHeight - 220
        ) {
          appendEpisodeRows(list);
        }
      });
    }

    appendEpisodeRows(list);

    if (!selectedEpisodeForActions && episodeRenderEntries.length) {
      selectedEpisodeForActions = episodeRenderEntries[0];
      updateSeriesHeroActions();
    }
  }

  function showSeriesReady() {
    var seasons = Object.keys(currentSeriesSeasons).sort(function (a, b) {
      return Number(a) - Number(b);
    });

    var rememberedSeason = readRememberedSeriesSeason();
    var resume = currentSeries && currentSeries.key
      ? readSeriesResume(currentSeries.key)
      : null;
    var preferredSeason =
      resume && resume.season ? String(resume.season) : String(rememberedSeason || "");

    currentSeriesSeason =
      preferredSeason && seasons.indexOf(preferredSeason) >= 0
        ? preferredSeason
        : seasons.length
        ? seasons[0]
        : null;

    renderSeasonTabs();
    selectedEpisodeForActions = findEpisodeFromResume(resume);
    renderEpisodes();
    updateSeriesHeroActions();

    setTimeout(function () {
      var resume = currentSeries && currentSeries.key
        ? readSeriesResume(currentSeries.key)
        : null;
      var resumeRow = null;

      if (resume && !resume.completed) {
        resumeRow = document.querySelector(
          '#episodeList .episode-row[data-season="' +
            String(resume.season || 1) +
            '"][data-episode="' +
            String(resume.episode || 1) +
            '"]'
        );
      }

      var first = resumeRow || document.querySelector("#seasonTabs .season-tab");
      if (first) first.focus();
    }, 30);
  }

  function openM3USeries(index, indexes) {
    var item = catalog[index];
    if (!item) return;

    var sourceIndexes =
      indexes && indexes.length ? indexes : [index];
    var firstMeta = episodeMeta(item.name);
    currentSeries = {
      source: "m3u",
      key: seriesKeyFromItem(item),
      name: firstMeta.seriesName || item.name,
      group: item.group || "Séries",
      cover: item.logo || "",
      year: item.year || "",
      rating: item.rating || "",
      plot: item.plot || ""
    };
    currentSeriesSeasons = {};

    sourceIndexes.forEach(function (catalogIndex) {
      var episodeItem = catalog[catalogIndex];
      if (!episodeItem) return;

      var meta = episodeMeta(episodeItem.name);
      var season = String(meta.season || 1);

      if (!currentSeriesSeasons[season]) {
        currentSeriesSeasons[season] = [];
      }

      currentSeriesSeasons[season].push({
        source: "m3u",
        catalogIndex: catalogIndex,
        season: meta.season || 1,
        episode: meta.episode || currentSeriesSeasons[season].length + 1,
        title: meta.episodeTitle || episodeItem.name
      });
    });

    setSeriesHero(
      currentSeries.name,
      currentSeries.group,
      currentSeries.cover,
      [currentSeries.year, currentSeries.rating ? "★ " + currentSeries.rating : ""]
        .filter(Boolean)
        .join(" • "),
      currentSeries.plot
    );
    showSeriesReady();
  }

  async function getXtreamSeriesData(item, playlist, session) {
    if (!item || !playlist || !session || !item.seriesId) return null;

    var cacheKey = playlist.id + ":" + item.seriesId;
    if (seriesCache[cacheKey]) return seriesCache[cacheKey];

    var url =
      session.server +
      "/player_api.php?username=" +
      encodeURIComponent(session.username) +
      "&password=" +
      encodeURIComponent(session.password) +
      "&action=get_series_info&series_id=" +
      encodeURIComponent(item.seriesId);

    var data = JSON.parse(await fetchRemoteText(url));
    seriesCache[cacheKey] = data;
    trimCache(seriesCache, 10);
    return data;
  }

  function scheduleXtreamSeriesPrefetch(index) {
    if (seriesPrefetchTimer) {
      clearTimeout(seriesPrefetchTimer);
      seriesPrefetchTimer = null;
    }

    var playlist = activePlaylist();
    var item = catalog[index];
    if (
      !playlist ||
      playlist.type !== "xtream" ||
      !item ||
      item.type !== "series" ||
      !item.seriesId
    ) {
      return;
    }

    var session = getXtreamSession(playlist.id);
    if (!session) return;

    var cacheKey = playlist.id + ":" + item.seriesId;
    if (seriesCache[cacheKey]) return;

    seriesPrefetchTimer = setTimeout(function () {
      seriesPrefetchTimer = null;
      getXtreamSeriesData(item, playlist, session).catch(function () {});
    }, 650);
  }

  async function openXtreamSeries(index) {
    var item = catalog[index];
    var playlist = activePlaylist();
    var session = playlist && getXtreamSession(playlist.id);

    if (!item || !item.seriesId || !session) {
      document.getElementById("episodeList").innerHTML =
        '<div class="series-empty">Faça login novamente na conta Xtream para carregar os episódios.</div>';
      return;
    }

    var data = null;

    try {
      data = await getXtreamSeriesData(item, playlist, session);
    } catch (error) {
      document.getElementById("episodeList").innerHTML =
        '<div class="series-empty">Não foi possível carregar temporadas e episódios desta série.</div>';
      return;
    }

    if (!data) {
      document.getElementById("episodeList").innerHTML =
        '<div class="series-empty">Nenhum dado foi retornado para esta série.</div>';
      return;
    }

    var info = data.info || {};
    currentSeries = {
      source: "xtream",
      key: seriesKeyFromItem(item),
      name: info.name || item.name,
      group: item.group || "Séries",
      cover: info.cover || item.logo || "",
      year: info.releaseDate || info.release_date || item.year || "",
      rating: info.rating || item.rating || "",
      plot: info.plot || item.plot || ""
    };
    currentSeriesSeasons = {};

    var episodes = data.episodes || {};
    Object.keys(episodes).forEach(function (seasonKey) {
      var seasonEpisodes = Array.isArray(episodes[seasonKey])
        ? episodes[seasonKey]
        : [];

      currentSeriesSeasons[String(seasonKey)] = seasonEpisodes.map(
        function (episode, position) {
          return {
            source: "xtream",
            id: episode.id,
            season: Number(episode.season || seasonKey || 1),
            episode: Number(episode.episode_num || position + 1),
            title: episode.title || "Episódio " + (position + 1),
            extension: episode.container_extension || "mp4"
          };
        }
      );
    });

    setSeriesHero(
      currentSeries.name,
      currentSeries.group,
      currentSeries.cover,
      [currentSeries.year, currentSeries.rating ? "★ " + currentSeries.rating : ""]
        .filter(Boolean)
        .join(" • "),
      currentSeries.plot
    );
    showSeriesReady();
  }

  function openSeries(index, indexes) {
    var item = catalog[index];
    if (!item) return;

    currentSeries = null;
    currentSeriesSeasons = {};
    currentSeriesSeason = null;
    selectedEpisodeForActions = null;
    setSeriesHero(item.name, item.group, item.logo, "", "");
    updateSeriesHeroActions();

    document.getElementById("seasonTabs").innerHTML = "";
    document.getElementById("episodeList").innerHTML =
      '<div class="series-loading">Carregando temporadas e episódios...</div>';
    document.getElementById("seriesEpisodeCount").textContent = "";

    show("seriesDetail");

    var playlist = activePlaylist();
    if (playlist && playlist.type === "xtream") {
      openXtreamSeries(index);
    } else {
      openM3USeries(index, indexes);
    }
  }

  function playSeriesEpisode(episode) {
    if (!episode) return;

    currentEpisode = episode;
    currentNextEpisode = findNextEpisode(episode);
    rememberSeriesSeason(episode.season || 1);
    saveSeriesResume(episode, 0, 0, false);

    if (episode.source === "m3u") {
      play(episode.catalogIndex);
      return;
    }

    var playlist = activePlaylist();
    var session = playlist && getXtreamSession(playlist.id);
    if (!session || !episode.id) return;

    var streamUrl =
      session.server +
      "/series/" +
      encodeURIComponent(session.username) +
      "/" +
      encodeURIComponent(session.password) +
      "/" +
      episode.id +
      "." +
      (episode.extension || "mp4");

    stopPreview();
    stopPlayer();
    pendingResumePosition = null;

    currentPlayingIndex = -1;
    currentPlaybackKey = "episode:" + String(episode.id);
    currentPlaybackKind = "series";
    currentStreamUrl = streamUrl;
    playerRetryCount = 0;

    var video = document.getElementById("video");
    document.getElementById("nowPlaying").textContent =
      (currentSeries ? currentSeries.name + " — " : "") +
      (episode.title || "Episódio");

    clearPlayerError();
    setPlayerLoading(true, "Carregando episódio...");
    updatePlayerSwitcher();

    show("player");
    showPlayerUi();
    loadVideoSource(video, streamUrl, "full");
    startPlaybackWatchdog();

    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function () {
        schedulePlayerRecovery(1500);
      });
    }
  }

  function streamUrlForItem(index) {
    var item = catalog[index];
    if (!item) return "";

    var current = activePlaylist();
    var streamUrl = item.url || "";

    if (current && current.type === "xtream") {
      if (item.type === "series") return "";

      var session = getXtreamSession(current.id);
      if (!session) return "";

      if (item.type === "live") {
        streamUrl =
          session.server + "/live/" +
          encodeURIComponent(session.username) + "/" +
          encodeURIComponent(session.password) + "/" +
          item.streamId + ".ts";
      } else if (item.type === "movie") {
        streamUrl =
          session.server + "/movie/" +
          encodeURIComponent(session.username) + "/" +
          encodeURIComponent(session.password) + "/" +
          item.streamId + "." + (item.extension || "mp4");
      }
    }

    return streamUrl;
  }

  function loadVideoSource(video, streamUrl, mode) {
    var isHls = /\.m3u8($|\?)/i.test(streamUrl);

    if (
      isHls &&
      !video.canPlayType("application/vnd.apple.mpegurl") &&
      window.Hls &&
      window.Hls.isSupported()
    ) {
      var hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: -1,
        capLevelToPlayerSize: mode === "preview",
        maxBufferLength: mode === "preview" ? 8 : 20,
        maxMaxBufferLength: mode === "preview" ? 16 : 40,
        backBufferLength: mode === "preview" ? 0 : 10,
        maxBufferSize: mode === "preview" ? 12 * 1000 * 1000 : 30 * 1000 * 1000,
        abrEwmaDefaultEstimate: mode === "preview" ? 1600000 : 5000000
      });

      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        if (mode === "preview" && settings.smartBandwidth) {
          var best720 = -1;
          hls.levels.forEach(function (level, index) {
            if ((level.height || 0) <= 720) best720 = index;
          });
          if (best720 >= 0) hls.autoLevelCapping = best720;
        }
      });

      hls.on(window.Hls.Events.LEVEL_SWITCHED, function (event, data) {
        if (mode !== "full") return;
        var level = hls.levels[data.level];
        var status = document.getElementById("playerStatus");
        if (status && level) {
          status.textContent =
            level.height ? "Auto • " + level.height + "p" : "Qualidade automática";
        }
      });

      hls.on(window.Hls.Events.ERROR, function (event, data) {
        if (!data || !data.fatal) return;

        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          try {
            hls.startLoad();
          } catch (error) {}
          if (mode === "full") {
            suppressLoadingOverlay = true;
            setPlayerLoading(false);
            schedulePlayerRecovery(6000);
          }
          return;
        }

        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
          } catch (error) {}
          if (mode === "full") {
            suppressLoadingOverlay = true;
            setPlayerLoading(false);
            schedulePlayerRecovery(5000);
          }
          return;
        }

        if (mode === "preview") {
          var media = document.getElementById("previewMedia");
          if (media) media.classList.remove("is-playing");
          document.getElementById("previewState").textContent =
            "Não foi possível reproduzir esta prévia.";
        } else {
          suppressLoadingOverlay = true;
          setPlayerLoading(false);
          schedulePlayerRecovery();
        }
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      if (mode === "preview") {
        previewHls = hls;
      } else {
        fullHls = hls;
      }

      return;
    }

    video.src = streamUrl;
    video.load();
  }

  function preview(index) {
    var item = catalog[index];
    if (!item || item.type === "series") return;

    var streamUrl = streamUrlForItem(index);
    if (!streamUrl) {
      document.getElementById("previewState").textContent =
        "Não foi possível montar a URL de reprodução.";
      return;
    }

    stopPreview();

    var video = document.getElementById("previewVideo");
    var media = document.getElementById("previewMedia");
    video.muted = !settings.previewAudio;
    loadVideoSource(video, streamUrl, "preview");

    media.classList.add("is-playing");
    document.getElementById("previewState").textContent = "Carregando...";

    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function () {
        media.classList.remove("is-playing");
        document.getElementById("previewState").textContent =
          "Este formato não pôde ser reproduzido na prévia do navegador.";
      });
    }
  }

  function play(index) {
    var item = catalog[index];
    if (!item) return;

    var current = activePlaylist();

    if (current && current.type === "xtream" && item.type === "series") {
      openSeries(index, null);
      return;
    }

    var streamUrl = streamUrlForItem(index);

    if (!streamUrl) {
      if (current && current.type === "xtream") {
        document.getElementById("playlistMessage").textContent =
          "Por segurança, informe novamente usuário e senha desta conta Xtream.";
        show("playlists");
      }
      return;
    }

    stopPreview();
    stopPlayer();
    pendingResumePosition = null;

    if (item.type !== "series") {
      currentEpisode = null;
      currentNextEpisode = null;
    }

    currentPlayingIndex = index;
    currentPlaybackKey = playbackKeyForItem(item);
    currentPlaybackKind = item.type;
    currentStreamUrl = streamUrl;
    playerRetryCount = 0;
    if (item.type === "live") rememberLastLive(item);

    var video = document.getElementById("video");
    document.getElementById("nowPlaying").textContent = item.name;
    clearPlayerError();
    setPlayerLoading(true, "Carregando...");
    updatePlayerSwitcher();

    show("player");
    showPlayerUi();
    loadVideoSource(video, streamUrl, "full");
    startPlaybackWatchdog();

    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function () {
        schedulePlayerRecovery(1500);
      });
    }
  }

  function catalogStats(items) {
    var stats = {
      total: 0,
      live: 0,
      movie: 0,
      series: 0
    };

    (items || []).forEach(function (item) {
      stats.total += 1;
      if (item.type === "live") stats.live += 1;
      else if (item.type === "movie") stats.movie += 1;
      else if (item.type === "series") stats.series += 1;
    });

    return stats;
  }

  function playlistMetadata(playlist) {
    return {
      id: playlist.id,
      name: playlist.name,
      type: playlist.type,
      sourceUrl: playlist.sourceUrl || "",
      epgUrl: playlist.epgUrl || "",
      server: playlist.server || "",
      favorites: Array.isArray(playlist.favorites) ? playlist.favorites : [],
      savedAt: playlist.savedAt || Date.now(),
      updatedAt: playlist.updatedAt || playlist.savedAt || Date.now(),
      stats: playlist.stats || catalogStats(playlist.catalog || [])
    };
  }

  function openCatalogDb() {
    if (catalogDbPromise) return catalogDbPromise;

    catalogDbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("indexeddb_unavailable"));
        return;
      }

      var request = indexedDB.open("smartplay_tv", 1);

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains("catalogs")) {
          db.createObjectStore("catalogs", { keyPath: "id" });
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error || new Error("indexeddb_open_failed"));
      };
    });

    return catalogDbPromise;
  }

  async function saveCatalogToDb(id, items) {
    var db = await openCatalogDb();

    return new Promise(function (resolve, reject) {
      var tx = db.transaction("catalogs", "readwrite");
      tx.objectStore("catalogs").put({
        id: id,
        catalog: items || [],
        savedAt: Date.now()
      });
      tx.oncomplete = function () {
        resolve(true);
      };
      tx.onerror = function () {
        reject(tx.error || new Error("catalog_save_failed"));
      };
    });
  }

  async function loadCatalogFromDb(id) {
    if (!id) return [];
    var db = await openCatalogDb();

    return new Promise(function (resolve, reject) {
      var tx = db.transaction("catalogs", "readonly");
      var request = tx.objectStore("catalogs").get(id);

      request.onsuccess = function () {
        resolve(
          request.result && Array.isArray(request.result.catalog)
            ? request.result.catalog
            : []
        );
      };
      request.onerror = function () {
        reject(request.error || new Error("catalog_load_failed"));
      };
    });
  }

  async function deleteCatalogFromDb(id) {
    if (!id) return;
    var db = await openCatalogDb();

    return new Promise(function (resolve, reject) {
      var tx = db.transaction("catalogs", "readwrite");
      tx.objectStore("catalogs").delete(id);
      tx.oncomplete = function () {
        resolve(true);
      };
      tx.onerror = function () {
        reject(tx.error || new Error("catalog_delete_failed"));
      };
    });
  }

  function persistPlaylists() {
    try {
      var metadata = playlists.map(playlistMetadata);
      localStorage.setItem("smartplay_playlists", JSON.stringify(metadata));

      if (activePlaylistId) {
        localStorage.setItem("smartplay_active_playlist_id", activePlaylistId);
      } else {
        localStorage.removeItem("smartplay_active_playlist_id");
      }
    } catch (error) {}
  }

  function activePlaylist() {
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === activePlaylistId) return playlists[i];
    }
    return null;
  }

  function trimCache(cache, maxEntries) {
    var keys = Object.keys(cache || {});
    while (keys.length > maxEntries) {
      delete cache[keys.shift()];
    }
  }

  function lastLiveStorageKey() {
    var playlist = activePlaylist();
    return playlist ? "smartplay_last_live:" + playlist.id : "";
  }

  function rememberLastLive(item) {
    if (!item || item.type !== "live") return;
    var key = lastLiveStorageKey();
    if (!key) return;

    try {
      localStorage.setItem(key, favoriteKey(item));
    } catch (error) {}
  }

  function findLastLiveIndex() {
    var key = lastLiveStorageKey();
    if (!key) return -1;

    var saved = "";
    try {
      saved = localStorage.getItem(key) || "";
    } catch (error) {}

    if (!saved) return -1;

    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].type === "live" && favoriteKey(catalog[i]) === saved) {
        return i;
      }
    }

    return -1;
  }

  function favoriteKey(item) {
    if (!item) return "";

    var playlist = activePlaylist();
    if (playlist && playlist.type === "xtream") {
      if (item.type === "series") {
        return "series:" + String(item.seriesId || item.name || "");
      }
      return item.type + ":" + String(item.streamId || item.url || item.name || "");
    }

    if (item.type === "series") {
      var meta = episodeMeta(item.name);
      return "series:" + normalizedText(meta.seriesName || item.name || "");
    }

    return item.type + ":" + String(item.url || item.tvgId || item.name || "");
  }

  function favoriteList() {
    var playlist = activePlaylist();
    if (!playlist) return [];

    if (!Array.isArray(playlist.favorites)) {
      playlist.favorites = [];
    }

    return playlist.favorites;
  }

  function isFavorite(item) {
    var key = favoriteKey(item);
    return !!key && favoriteList().indexOf(key) >= 0;
  }

  function favoriteCountForType(type) {
    var seen = {};
    itemsFor(type).forEach(function (item) {
      if (isFavorite(item)) {
        seen[favoriteKey(item)] = true;
      }
    });
    return Object.keys(seen).length;
  }

  function updateFavoriteButton(item) {
    var button = document.getElementById("favoriteSelected");
    if (!button) return;

    if (!item) {
      button.disabled = true;
      button.classList.remove("is-favorite");
      button.textContent = "☆ Favoritar";
      return;
    }

    var favorite = isFavorite(item);
    button.disabled = false;
    button.classList.toggle("is-favorite", favorite);
    button.textContent = favorite ? "★ Favorito" : "☆ Favoritar";
  }

  function toggleFavorite(index) {
    var item = catalog[index];
    var playlist = activePlaylist();
    if (!item || !playlist) return;

    var key = favoriteKey(item);
    if (!key) return;

    var favorites = favoriteList();
    var position = favorites.indexOf(key);

    if (position >= 0) {
      favorites.splice(position, 1);
    } else {
      favorites.push(key);
    }

    persistPlaylists();
    updateFavoriteButton(item);
    renderCategories();

    if (browseCategory === "__favorites__") {
      renderBrowserContents();
    } else {
      var row = document.querySelector(
        '.content-row[data-catalog-index="' + index + '"]'
      );
      if (row) {
        var chevron = row.querySelector(".content-chevron");
        if (chevron) chevron.textContent = isFavorite(item) ? "★" : "›";
      }

      var card = document.querySelector(
        '.media-card[data-catalog-index="' + index + '"]'
      );
      if (card) {
        var poster = card.querySelector(".media-poster");
        var badge = card.querySelector(".media-favorite-badge");
        if (isFavorite(item) && !badge) {
          badge = document.createElement("span");
          badge.className = "media-favorite-badge";
          badge.textContent = "★";
          poster.appendChild(badge);
        } else if (!isFavorite(item) && badge) {
          badge.remove();
        }
      }
    }
  }

  async function applyActivePlaylist() {
    var current = activePlaylist();
    catalog = [];

    if (current) {
      try {
        catalog = await loadCatalogFromDb(current.id);
      } catch (error) {
        catalog = Array.isArray(current.catalog) ? current.catalog : [];
      }
    }

    indexCatalogItems();

    document.getElementById("status").textContent = current
      ? "Playlist: " + current.name
      : "TV não vinculada";
  }

  async function setActivePlaylist(id) {
    activePlaylistId = id;
    await applyActivePlaylist();
    persistPlaylists();
    renderSavedPlaylists();
  }

  function formatPlaylistDate(value) {
    if (!value) return "Nunca";
    try {
      return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (error) {
      return "—";
    }
  }

  function renderSavedPlaylists() {
    var box = document.getElementById("savedPlaylists");
    var count = document.getElementById("savedCount");
    if (!box || !count) return;

    count.textContent = String(playlists.length);
    box.innerHTML = "";

    if (!playlists.length) {
      box.innerHTML =
        '<div class="saved-empty">Nenhuma playlist adicionada ainda.</div>';
      return;
    }

    playlists.forEach(function (playlist) {
      var row = document.createElement("div");
      var isActive = playlist.id === activePlaylistId;
      var stats = playlist.stats || {
        total: 0,
        live: 0,
        movie: 0,
        series: 0
      };

      row.className = "saved-playlist" + (isActive ? " active-playlist" : "");
      row.innerHTML =
        '<div class="saved-info"><strong>' +
        esc(playlist.name) +
        (isActive ? '<span class="active-badge">ATIVA</span>' : "") +
        '</strong><small>' +
        (playlist.type === "m3u" ? "M3U / M3U8" : "Xtream") +
        " • " +
        stats.live +
        " TV • " +
        stats.movie +
        " filmes • " +
        stats.series +
        " séries</small><small class=\"saved-updated\">Atualizada: " +
        esc(formatPlaylistDate(playlist.updatedAt || playlist.savedAt)) +
        "</small></div>" +
        '<div class="saved-actions">' +
        '<button class="focusable" data-action="testPlaylist" data-playlist-id="' +
        esc(playlist.id) +
        '">Testar</button>' +
        '<button class="focusable" data-action="refreshPlaylist" data-playlist-id="' +
        esc(playlist.id) +
        '">Atualizar</button>' +
        '<button class="focusable" data-action="editPlaylist" data-playlist-id="' +
        esc(playlist.id) +
        '">Editar</button>' +
        '<button class="focusable use-playlist" data-action="usePlaylist" data-playlist-id="' +
        esc(playlist.id) +
        '"' +
        (isActive ? " disabled" : "") +
        ">" +
        (isActive ? "Em uso" : "Usar") +
        '</button>' +
        '<button class="focusable remove-playlist" data-action="removePlaylist" data-playlist-id="' +
        esc(playlist.id) +
        '">Remover</button></div>';

      box.appendChild(row);
    });
  }

  async function migrateLegacyCatalogs() {
    var changed = false;

    for (var i = 0; i < playlists.length; i++) {
      var playlist = playlists[i];

      if (Array.isArray(playlist.catalog) && playlist.catalog.length) {
        if (playlist.type === "m3u") {
          playlist.catalog.forEach(function (item) {
            item.type = inferType(item);
          });
        }

        playlist.stats = catalogStats(playlist.catalog);
        await saveCatalogToDb(playlist.id, playlist.catalog);
        delete playlist.catalog;
        changed = true;
      }
    }

    if (changed) persistPlaylists();
  }

  async function loadPlaylists() {
    try {
      var saved = JSON.parse(localStorage.getItem("smartplay_playlists") || "[]");
      playlists = Array.isArray(saved) ? saved : [];
      activePlaylistId = localStorage.getItem("smartplay_active_playlist_id");

      if (!playlists.length) {
        var legacy = JSON.parse(localStorage.getItem("smartplay_catalog") || "null");
        if (legacy && Array.isArray(legacy.catalog)) {
          var migrated = {
            id: "pl_" + Date.now().toString(36),
            name: legacy.name || "Minha lista",
            type: "m3u",
            sourceUrl: legacy.sourceUrl || "",
            savedAt: legacy.savedAt || Date.now(),
            updatedAt: legacy.savedAt || Date.now(),
            stats: catalogStats(legacy.catalog),
            catalog: legacy.catalog
          };
          playlists.push(migrated);
          activePlaylistId = migrated.id;
          localStorage.removeItem("smartplay_catalog");
        }
      }

      await migrateLegacyCatalogs();

      if (!activePlaylistId && playlists.length) {
        activePlaylistId = playlists[0].id;
      }

      if (activePlaylistId && !activePlaylist()) {
        activePlaylistId = playlists.length ? playlists[0].id : null;
      }

      persistPlaylists();
      await applyActivePlaylist();
      renderSavedPlaylists();
    } catch (error) {
      playlists = [];
      activePlaylistId = null;
      catalog = [];
      renderSavedPlaylists();
    }
  }

  async function removePlaylist(id) {
    var wasActive = id === activePlaylistId;
    removeXtreamSession(id);

    try {
      await deleteCatalogFromDb(id);
    } catch (error) {}

    playlists = playlists.filter(function (playlist) {
      return playlist.id !== id;
    });

    if (wasActive) {
      activePlaylistId = playlists.length ? playlists[0].id : null;
    }

    persistPlaylists();
    await applyActivePlaylist();
    renderSavedPlaylists();
  }

  function playlistById(id) {
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === id) return playlists[i];
    }
    return null;
  }

  function activatePlaylistSourceTab(type) {
    activeType = type === "xtream" ? "xtream" : "m3u";

    document.querySelectorAll(".source-tab").forEach(function (tab) {
      tab.classList.toggle("active-tab", tab.dataset.source === activeType);
    });

    document.querySelectorAll(".source-form").forEach(function (form) {
      form.classList.remove("active-form");
    });

    var form = document.getElementById(
      activeType === "m3u" ? "m3uForm" : "xtreamForm"
    );
    if (form) form.classList.add("active-form");
  }

  function resetPlaylistEditor() {
    editingPlaylistId = null;
    document.getElementById("playlistFormTitle").textContent =
      "Adicionar playlist";
    document.getElementById("playlistSaveButton").textContent = "Adicionar";
    document.getElementById("playlistMessage").textContent = "";

    document.getElementById("m3uName").value = "";
    document.getElementById("m3uUrl").value = "";
    document.getElementById("xtreamName").value = "";
    document.getElementById("xtreamServer").value = "";
    document.getElementById("xtreamUser").value = "";
    document.getElementById("xtreamPass").value = "";

    activatePlaylistSourceTab("m3u");
  }

  function beginPlaylistEdit(id) {
    var playlist = playlistById(id);
    if (!playlist) return;

    editingPlaylistId = id;
    document.getElementById("playlistFormTitle").textContent =
      "Editar playlist";
    document.getElementById("playlistSaveButton").textContent = "Salvar";

    activatePlaylistSourceTab(playlist.type);

    if (playlist.type === "m3u") {
      document.getElementById("m3uName").value = playlist.name || "";
      document.getElementById("m3uUrl").value = playlist.sourceUrl || "";
    } else {
      var session = getXtreamSession(playlist.id);
      document.getElementById("xtreamName").value = playlist.name || "";
      document.getElementById("xtreamServer").value = playlist.server || "";
      document.getElementById("xtreamUser").value =
        session && session.username ? session.username : "";
      document.getElementById("xtreamPass").value = "";
    }

    document.getElementById("playlistMessage").textContent =
      playlist.type === "xtream"
        ? "Edite os dados. A senha pode ficar vazia para manter a sessão atual."
        : "Edite nome ou URL e salve para atualizar o catálogo.";
  }

  async function testPlaylistForm() {
    var message = document.getElementById("playlistMessage");
    message.textContent = "Testando conexão...";

    try {
      if (activeType === "m3u") {
        var url = document.getElementById("m3uUrl").value.trim();
        if (!/^https?:\/\//i.test(url)) {
          throw new Error("Informe uma URL http ou https válida.");
        }

        var probe = await probeRemoteUrl(url);
        var prefix = String(probe.prefix || "");

        message.textContent =
          prefix.indexOf("#EXTM3U") >= 0
            ? "Conexão OK. A fonte respondeu como playlist M3U/M3U8."
            : "A URL respondeu, mas o início do conteúdo não parece uma playlist M3U.";
        return;
      }

      var server = normalizeServer(
        document.getElementById("xtreamServer").value
      );
      var username = document.getElementById("xtreamUser").value.trim();
      var password = document.getElementById("xtreamPass").value;

      if ((!username || !password) && editingPlaylistId) {
        var existingSession = getXtreamSession(editingPlaylistId);
        if (existingSession) {
          username = username || existingSession.username;
          password = password || existingSession.password;
        }
      }

      if (!server || !username || !password) {
        throw new Error("Informe servidor, usuário e senha para testar.");
      }

      var account = await xtreamRequest(server, username, password, "");
      if (
        !account ||
        !account.user_info ||
        String(account.user_info.auth) !== "1"
      ) {
        throw new Error("credenciais não autorizadas");
      }

      message.textContent = "Conexão Xtream OK. Conta autorizada.";
    } catch (error) {
      message.textContent =
        "Falha no teste: " +
        (error && error.message ? error.message : "erro desconhecido");
    }
  }

  async function testStoredPlaylist(id) {
    var playlist = playlistById(id);
    var message = document.getElementById("playlistMessage");
    if (!playlist || !message) return;

    message.textContent = "Testando " + playlist.name + "...";

    try {
      if (playlist.type === "m3u") {
        var probe = await probeRemoteUrl(playlist.sourceUrl);
        var looksM3u = String(probe.prefix || "").indexOf("#EXTM3U") >= 0;

        message.textContent = looksM3u
          ? playlist.name + ": conexão OK."
          : playlist.name + ": respondeu, mas não parece uma playlist M3U.";
        return;
      }

      var session = getXtreamSession(playlist.id);
      if (!session) {
        throw new Error(
          "faça login novamente nesta conta Xtream para testar"
        );
      }

      var account = await xtreamRequest(
        session.server,
        session.username,
        session.password,
        ""
      );

      if (
        !account ||
        !account.user_info ||
        String(account.user_info.auth) !== "1"
      ) {
        throw new Error("conta não autorizada");
      }

      message.textContent = playlist.name + ": conexão Xtream OK.";
    } catch (error) {
      message.textContent =
        playlist.name +
        ": falha no teste — " +
        (error && error.message ? error.message : "erro desconhecido");
    }
  }

  async function refreshPlaylistById(id, message) {
    var playlist = playlistById(id);
    if (!playlist) throw new Error("playlist não encontrada");

    if (message) {
      message.textContent = "Atualizando " + playlist.name + "...";
    }

    var refreshed = [];

    if (playlist.type === "m3u") {
      var text = await fetchRemoteText(playlist.sourceUrl);
      if (text.indexOf("#EXTM3U") < 0) {
        throw new Error("A fonte não retornou uma playlist M3U válida.");
      }

      refreshed = await parseM3UAsync(text, function (percent) {
        if (message) {
          message.textContent =
            "Atualizando " + playlist.name + "... " + percent + "%";
        }
      });

      var epgUrl = parseEpgUrl(text);
      if (epgUrl) {
        epgUrl = epgUrl.split(/[;,]/)[0].trim();
        try {
          epgUrl = new URL(epgUrl, playlist.sourceUrl).href;
        } catch (error) {}
      }
      playlist.epgUrl = epgUrl;
    } else {
      var session = getXtreamSession(playlist.id);
      if (!session) {
        throw new Error(
          "As credenciais Xtream não estão nesta sessão. Edite a playlist e informe usuário e senha."
        );
      }

      var results = await Promise.all([
        safeXtreamRequest(
          session.server,
          session.username,
          session.password,
          "get_live_categories"
        ),
        safeXtreamRequest(
          session.server,
          session.username,
          session.password,
          "get_vod_categories"
        ),
        safeXtreamRequest(
          session.server,
          session.username,
          session.password,
          "get_series_categories"
        ),
        safeXtreamRequest(
          session.server,
          session.username,
          session.password,
          "get_live_streams"
        ),
        safeXtreamRequest(
          session.server,
          session.username,
          session.password,
          "get_vod_streams"
        ),
        safeXtreamRequest(
          session.server,
          session.username,
          session.password,
          "get_series"
        )
      ]);

      var liveCategories = categoryMap(results[0]);
      var movieCategories = categoryMap(results[1]);
      var seriesCategories = categoryMap(results[2]);

      results[3].forEach(function (item) {
        refreshed.push({
          name: item.name || "Canal",
          group: liveCategories[String(item.category_id)] || "TV ao Vivo",
          logo: item.stream_icon || "",
          type: "live",
          streamId: item.stream_id
        });
      });

      results[4].forEach(function (item) {
        refreshed.push({
          name: item.name || "Filme",
          group: movieCategories[String(item.category_id)] || "Filmes",
          logo: item.stream_icon || "",
          type: "movie",
          streamId: item.stream_id,
          extension: item.container_extension || "mp4",
          rating: item.rating || "",
          year: item.year || item.releasedate || "",
          plot: item.plot || ""
        });
      });

      results[5].forEach(function (item) {
        refreshed.push({
          name: item.name || "Série",
          group: seriesCategories[String(item.category_id)] || "Séries",
          logo: item.cover || "",
          type: "series",
          seriesId: item.series_id,
          rating: item.rating || "",
          year: item.releaseDate || item.release_date || "",
          plot: item.plot || ""
        });
      });
    }

    if (!refreshed.length) {
      throw new Error("nenhum conteúdo foi retornado");
    }

    playlist.updatedAt = Date.now();
    playlist.stats = catalogStats(refreshed);
    await saveCatalogToDb(playlist.id, refreshed);

    if (playlist.id === activePlaylistId) {
      catalog = refreshed;
      indexCatalogItems();
    }

    delete epgCache[playlist.id];
    persistPlaylists();
    renderSavedPlaylists();

    if (message) {
      message.textContent =
        playlist.name +
        " atualizada: " +
        playlist.stats.total +
        " itens.";
    }

    return refreshed;
  }

  async function addM3U() {
    var name = document.getElementById("m3uName").value.trim() || "Minha playlist";
    var url = document.getElementById("m3uUrl").value.trim();
    var message = document.getElementById("playlistMessage");

    if (!/^https?:\/\//i.test(url)) {
      message.textContent = "Informe uma URL http ou https válida.";
      return;
    }

    message.textContent = "Carregando playlist... listas grandes podem levar alguns segundos.";

    try {
      var text = await fetchRemoteText(url);

      if (text.indexOf("#EXTM3U") < 0) {
        throw new Error("O endereço respondeu, mas não contém uma playlist M3U válida.");
      }

      var parsed = await parseM3UAsync(text, function (percent) {
        message.textContent =
          "Processando playlist... " + percent + "%";
      });
      var epgUrl = parseEpgUrl(text);
      if (epgUrl) {
        epgUrl = epgUrl.split(/[;,]/)[0].trim();
        try {
          epgUrl = new URL(epgUrl, url).href;
        } catch (error) {}
      }

      if (!parsed.length) {
        throw new Error("Nenhum item foi encontrado na playlist.");
      }

      var now = Date.now();
      var existing = editingPlaylistId
        ? playlistById(editingPlaylistId)
        : null;
      var targetPlaylist;

      if (existing) {
        existing.name = name;
        existing.sourceUrl = url;
        existing.epgUrl = epgUrl;
        existing.updatedAt = now;
        existing.stats = catalogStats(parsed);
        targetPlaylist = existing;
      } else {
        targetPlaylist = {
          id:
            "pl_" +
            now.toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 7),
          name: name,
          type: "m3u",
          sourceUrl: url,
          epgUrl: epgUrl,
          savedAt: now,
          updatedAt: now,
          stats: catalogStats(parsed),
          favorites: []
        };
        playlists.push(targetPlaylist);
      }

      await saveCatalogToDb(targetPlaylist.id, parsed);
      activePlaylistId = targetPlaylist.id;
      catalog = parsed;
      indexCatalogItems();
      persistPlaylists();
      renderSavedPlaylists();

      var live = itemsFor("live").length;
      var movies = itemsFor("movie").length;
      var series = itemsFor("series").length;

      document.getElementById("status").textContent = "Playlist: " + name;
      message.textContent =
        name +
        (existing ? " atualizada com sucesso — " : " adicionada com sucesso — ") +
        parsed.length +
        " itens (" +
        live +
        " TV, " +
        movies +
        " filmes, " +
        series +
        " séries).";

      editingPlaylistId = null;
      document.getElementById("playlistFormTitle").textContent =
        "Adicionar playlist";
      document.getElementById("playlistSaveButton").textContent = "Adicionar";
      document.getElementById("m3uName").value = "";
      document.getElementById("m3uUrl").value = "";
    } catch (error) {
      var status = error && error.remoteStatus;
      if (status === 404) {
        message.textContent = "Playlist não encontrada no servidor (HTTP 404).";
      } else if (status === 401 || status === 403) {
        message.textContent = "O servidor recusou o acesso à playlist (HTTP " + status + ").";
      } else if (String(error && error.message).indexOf("timeout") >= 0) {
        message.textContent =
          "A playlist é muito lenta para responder. O app tentou por até 60 segundos.";
      } else if (
        String(error && error.message).indexOf("remote_file_too_large") >= 0
      ) {
        message.textContent =
          "A playlist ultrapassa o limite de 100 MB e não pode ser carregada com segurança.";
      } else {
        message.textContent = "Não foi possível carregar a playlist: " + error.message;
      }
    }
  }

  async function xtreamRequest(server, username, password, action) {
    var url =
      server + "/player_api.php?username=" +
      encodeURIComponent(username) +
      "&password=" + encodeURIComponent(password);

    if (action) url += "&action=" + encodeURIComponent(action);

    var response = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    return response.json();
  }

  async function safeXtreamRequest(server, username, password, action) {
    try {
      var result = await xtreamRequest(server, username, password, action);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      return [];
    }
  }

  async function addXtream() {
    var name =
      document.getElementById("xtreamName").value.trim() || "Minha conta";
    var server = normalizeServer(
      document.getElementById("xtreamServer").value
    );
    var username = document.getElementById("xtreamUser").value.trim();
    var password = document.getElementById("xtreamPass").value;
    var message = document.getElementById("playlistMessage");

    if (editingPlaylistId && (!username || !password)) {
      var editSession = getXtreamSession(editingPlaylistId);
      if (editSession) {
        username = username || editSession.username;
        password = password || editSession.password;
      }
    }

    if (!/^https?:\/\//i.test(server)) {
      message.textContent = "Informe uma URL de servidor http ou https válida.";
      return;
    }

    if (!username || !password) {
      message.textContent = "Informe usuário e senha da conta Xtream.";
      return;
    }

    message.textContent = "Conectando à conta Xtream...";

    try {
      var account = await xtreamRequest(server, username, password, "");

      if (
        !account ||
        !account.user_info ||
        String(account.user_info.auth) !== "1"
      ) {
        throw new Error("credenciais não autorizadas");
      }

      message.textContent = "Conta validada. Carregando catálogo...";

      var results = await Promise.all([
        safeXtreamRequest(server, username, password, "get_live_categories"),
        safeXtreamRequest(server, username, password, "get_vod_categories"),
        safeXtreamRequest(server, username, password, "get_series_categories"),
        safeXtreamRequest(server, username, password, "get_live_streams"),
        safeXtreamRequest(server, username, password, "get_vod_streams"),
        safeXtreamRequest(server, username, password, "get_series")
      ]);

      var liveCategories = categoryMap(results[0]);
      var movieCategories = categoryMap(results[1]);
      var seriesCategories = categoryMap(results[2]);
      var parsed = [];

      results[3].forEach(function (item) {
        parsed.push({
          name: item.name || "Canal",
          group: liveCategories[String(item.category_id)] || "TV ao Vivo",
          logo: item.stream_icon || "",
          type: "live",
          streamId: item.stream_id
        });
      });

      results[4].forEach(function (item) {
        parsed.push({
          name: item.name || "Filme",
          group: movieCategories[String(item.category_id)] || "Filmes",
          logo: item.stream_icon || "",
          type: "movie",
          streamId: item.stream_id,
          extension: item.container_extension || "mp4",
          rating: item.rating || "",
          year: item.year || item.releasedate || "",
          plot: item.plot || ""
        });
      });

      results[5].forEach(function (item) {
        parsed.push({
          name: item.name || "Série",
          group: seriesCategories[String(item.category_id)] || "Séries",
          logo: item.cover || "",
          type: "series",
          seriesId: item.series_id,
          rating: item.rating || "",
          year: item.releaseDate || item.release_date || "",
          plot: item.plot || ""
        });
      });

      if (!parsed.length) {
        throw new Error("nenhum conteúdo foi retornado");
      }

      var now = Date.now();
      var existing = editingPlaylistId
        ? playlistById(editingPlaylistId)
        : null;
      var targetPlaylist;

      if (existing) {
        existing.name = name;
        existing.server = server;
        existing.updatedAt = now;
        existing.stats = catalogStats(parsed);
        targetPlaylist = existing;
      } else {
        targetPlaylist = {
          id:
            "xt_" +
            now.toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 7),
          name: name,
          type: "xtream",
          server: server,
          savedAt: now,
          updatedAt: now,
          stats: catalogStats(parsed),
          favorites: []
        };
        playlists.push(targetPlaylist);
      }

      await saveCatalogToDb(targetPlaylist.id, parsed);
      activePlaylistId = targetPlaylist.id;
      catalog = parsed;
      indexCatalogItems();

      saveXtreamSession(targetPlaylist.id, {
        server: server,
        username: username,
        password: password
      });

      persistPlaylists();
      renderSavedPlaylists();

      var live = itemsFor("live").length;
      var movies = itemsFor("movie").length;
      var series = itemsFor("series").length;

      document.getElementById("status").textContent = "Playlist: " + name;
      message.textContent =
        name +
        (existing ? " atualizada — " : " adicionada — ") +
        live +
        " TV, " +
        movies +
        " filmes, " +
        series +
        " séries.";

      editingPlaylistId = null;
      document.getElementById("playlistFormTitle").textContent =
        "Adicionar playlist";
      document.getElementById("playlistSaveButton").textContent = "Adicionar";
      document.getElementById("xtreamName").value = "";
      document.getElementById("xtreamServer").value = "";
      document.getElementById("xtreamUser").value = "";
      document.getElementById("xtreamPass").value = "";
    } catch (error) {
      message.textContent =
        "Não foi possível conectar à conta Xtream: " +
        error.message +
        ". Se o servidor bloquear acesso direto da TV, faremos essa conexão pelo backend.";
    }
  }

  async function refreshActivePlaylist() {
    var playlist = activePlaylist();
    var message = document.getElementById("settingsMessage");

    if (!playlist) {
      if (message) message.textContent = "Nenhuma playlist ativa.";
      return;
    }

    try {
      await refreshPlaylistById(playlist.id, message);
      if (document.getElementById("settingsPlaylist")) {
        document.getElementById("settingsPlaylist").textContent = playlist.name;
      }
    } catch (error) {
      if (message) {
        message.textContent =
          "Não foi possível atualizar: " +
          (error && error.message ? error.message : "erro desconhecido");
      }
    }
  }

  async function testConnection() {
    var label = document.getElementById("settingsNetwork");
    var message = document.getElementById("settingsMessage");

    if (label) label.textContent = "Testando...";
    if (message) message.textContent = "";

    try {
      var response = await fetch("/api/health", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) throw new Error("HTTP " + response.status);

      var connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;
      var detail = navigator.onLine ? "Online" : "Offline";

      if (
        connection &&
        typeof connection.downlink === "number" &&
        connection.downlink > 0
      ) {
        detail += " • ~" + connection.downlink + " Mbps";
      }

      if (label) label.textContent = detail;
      if (message) {
        message.textContent =
          "Conexão com o serviço local está funcionando normalmente.";
      }
    } catch (error) {
      if (label) label.textContent = navigator.onLine ? "Internet ativa" : "Offline";
      if (message) {
        message.textContent =
          "O teste do serviço local falhou. A internet pode continuar funcionando normalmente.";
      }
    }
  }

  function openSettings() {
    var playlist = activePlaylist();
    document.getElementById("settingsPlaylist").textContent = playlist
      ? playlist.name
      : "Nenhuma";
    document.getElementById("settingsNetwork").textContent = navigator.onLine
      ? "Online"
      : "Offline";
    document.getElementById("settingsMessage").textContent = "";
    loadSettings();
    show("settings");
  }

  function retryCurrentStream(automatic) {
    if (!currentStreamUrl) return;

    var playerScreen = document.getElementById("player");
    if (!playerScreen || !playerScreen.classList.contains("active")) return;

    playerRetryCount += 1;
    clearPlayerError();

    var video = document.getElementById("video");
    var keepOverlayHidden = !!automatic || playerHasStarted;
    var resumePosition =
      currentPlaybackKind !== "live" &&
      isFinite(video.currentTime) &&
      video.currentTime > 0
        ? video.currentTime
        : null;

    pendingResumePosition = resumePosition;
    stopPlayer();
    playerHasStarted = keepOverlayHidden;
    suppressLoadingOverlay = keepOverlayHidden;
    setPlayerLoading(false);

    loadVideoSource(video, currentStreamUrl, "full");
    startPlaybackWatchdog();

    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function () {
        schedulePlayerRecovery();
      });
    }
  }

  function schedulePlayerRecovery(delay) {
    if (recoveryTimeout || !currentStreamUrl) return;

    var wait =
      typeof delay === "number"
        ? delay
        : Math.min(10000, 1200 + playerRetryCount * 1400);

    if (!playerHasStarted && !suppressLoadingOverlay) {
      setPlayerLoading(true, "Carregando...");
    } else {
      setPlayerLoading(false);
    }

    recoveryTimeout = setTimeout(function () {
      recoveryTimeout = null;

      var playerScreen = document.getElementById("player");
      if (!playerScreen || !playerScreen.classList.contains("active")) return;

      retryCurrentStream(true);
    }, wait);
  }

  function recoverStalledPlayback() {
    var playerScreen = document.getElementById("player");
    var video = document.getElementById("video");

    if (
      !playerScreen ||
      !playerScreen.classList.contains("active") ||
      !currentStreamUrl ||
      !video ||
      video.paused ||
      video.ended ||
      autoRecoveryInProgress
    ) {
      return;
    }

    var now = Date.now();
    if (now - lastAutoRecoveryAt < 5000) return;

    lastAutoRecoveryAt = now;
    autoRecoveryInProgress = true;
    suppressLoadingOverlay = true;
    setPlayerLoading(false);

    if (fullHls && playerRetryCount === 0) {
      playerRetryCount += 1;
      try {
        fullHls.startLoad(-1);
        var hlsPlay = video.play();
        if (hlsPlay && hlsPlay.catch) {
          hlsPlay.catch(function () {});
        }
      } catch (error) {}

      setTimeout(function () {
        autoRecoveryInProgress = false;
      }, 1800);
      return;
    }

    autoRecoveryInProgress = false;
    retryCurrentStream(true);
  }

  function startPlaybackWatchdog() {
    var video = document.getElementById("video");
    if (!video) return;

    if (playbackWatchdog) {
      clearInterval(playbackWatchdog);
    }

    lastPlaybackTime = isFinite(video.currentTime) ? video.currentTime : -1;
    lastPlaybackAdvanceAt = Date.now();

    playbackWatchdog = setInterval(function () {
      var playerScreen = document.getElementById("player");
      if (!playerScreen || !playerScreen.classList.contains("active")) return;
      if (!currentStreamUrl || video.paused || video.ended || video.seeking) return;

      var currentTime = isFinite(video.currentTime) ? video.currentTime : 0;

      if (
        lastPlaybackTime < 0 ||
        currentTime > lastPlaybackTime + 0.2 ||
        currentTime < lastPlaybackTime - 0.5
      ) {
        lastPlaybackTime = currentTime;
        lastPlaybackAdvanceAt = Date.now();
        return;
      }

      if (Date.now() - lastPlaybackAdvanceAt >= 7000) {
        lastPlaybackAdvanceAt = Date.now();
        recoverStalledPlayback();
      }
    }, 2000);
  }

  function bindPlayerEvents() {
    var video = document.getElementById("video");
    if (!video) return;

    video.addEventListener("loadstart", function () {
      if (playerHasStarted || suppressLoadingOverlay) {
        setPlayerLoading(false);
      } else {
        setPlayerLoading(true, "Carregando...");
      }
    });

    video.addEventListener("waiting", function () {
      if (playerHasStarted || suppressLoadingOverlay) {
        setPlayerLoading(false);
      } else {
        setPlayerLoading(true, "Carregando...");
      }
    });

    video.addEventListener("stalled", function () {
      if (playerHasStarted || suppressLoadingOverlay) {
        setPlayerLoading(false);
      }
    });

    video.addEventListener("playing", function () {
      setPlayerLoading(false);
      clearPlayerError();
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
        recoveryTimeout = null;
      }
      playerRetryCount = 0;
      autoRecoveryInProgress = false;
      playerHasStarted = true;
      suppressLoadingOverlay = false;
      lastPlaybackTime = isFinite(video.currentTime) ? video.currentTime : -1;
      lastPlaybackAdvanceAt = Date.now();
      startPlaybackWatchdog();
      showPlayerUi();
    });

    video.addEventListener("canplay", function () {
      setPlayerLoading(false);
    });

    video.addEventListener("loadedmetadata", function () {
      if (
        pendingResumePosition != null &&
        currentPlaybackKind !== "live" &&
        isFinite(pendingResumePosition)
      ) {
        try {
          video.currentTime = pendingResumePosition;
        } catch (error) {}
        pendingResumePosition = null;
        return;
      }

      if (
        settings.resumePlayback &&
        currentPlaybackKey &&
        currentPlaybackKind !== "live"
      ) {
        var progress = readProgress(currentPlaybackKey);
        if (
          progress &&
          progress.currentTime > 20 &&
          progress.duration > 0 &&
          progress.currentTime < progress.duration * 0.92
        ) {
          try {
            video.currentTime = progress.currentTime;
          } catch (error) {}
        }
      }
    });

    video.addEventListener("timeupdate", function () {
      var now = Date.now();

      if (now - lastPlayerUiUpdateAt >= 1000) {
        lastPlayerUiUpdateAt = now;
        updateEpisodeActionButtons(false);
      }

      if (
        !currentPlaybackKey ||
        currentPlaybackKind === "live" ||
        now - lastProgressSaveAt < 5000
      ) {
        return;
      }

      lastProgressSaveAt = now;
      saveProgress(
        currentPlaybackKey,
        video.currentTime || 0,
        video.duration || 0,
        false
      );

      if (currentPlaybackKind === "series" && currentEpisode) {
        saveSeriesResume(
          currentEpisode,
          video.currentTime || 0,
          video.duration || 0,
          false
        );
      }
    });

    video.addEventListener("pause", function () {
      if (
        currentPlaybackKey &&
        currentPlaybackKind !== "live" &&
        video.currentTime > 0 &&
        isFinite(video.currentTime)
      ) {
        saveProgress(
          currentPlaybackKey,
          video.currentTime || 0,
          video.duration || 0,
          false
        );

        if (currentPlaybackKind === "series" && currentEpisode) {
          saveSeriesResume(
            currentEpisode,
            video.currentTime || 0,
            video.duration || 0,
            false
          );
        }
      }
    });

    video.addEventListener("ended", function () {
      if (currentPlaybackKey && currentPlaybackKind !== "live") {
        saveProgress(
          currentPlaybackKey,
          video.duration || video.currentTime || 0,
          video.duration || 0,
          true
        );
      }

      if (currentPlaybackKind === "series" && currentEpisode) {
        currentNextEpisode = findNextEpisode(currentEpisode);

        if (currentNextEpisode) {
          saveSeriesResume(currentNextEpisode, 0, 0, false);
        } else {
          saveSeriesResume(
            currentEpisode,
            video.duration || video.currentTime || 0,
            video.duration || 0,
            true
          );
        }

        updateEpisodeActionButtons(true);
        if (currentSeriesSeason != null) {
          renderEpisodes();
        }
      }
    });

    video.addEventListener("error", function () {
      if (!currentStreamUrl) return;

      suppressLoadingOverlay = true;
      setPlayerLoading(false);
      schedulePlayerRecovery();
    });
  }

  function placeholder(title) {
    document.getElementById("placeholderTitle").textContent = title;
    show("placeholder");
  }

  function goBack() {
    if (historyStack.length > 1) historyStack.pop();
    var target = historyStack[historyStack.length - 1];
    show(target, false);

    if (target === "movieDetail" && currentMovieIndex >= 0) {
      openMovieDetail(currentMovieIndex);
    } else if (target === "seriesDetail" && currentSeries) {
      renderEpisodes();
      updateSeriesHeroActions();
    }
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]");
    if (!button) return;

    var action = button.dataset.action;

    if (action === "channels") {
      renderBrowser("live");
      show("channels");
    } else if (action === "movies") {
      renderBrowser("movie");
      show("channels");
    } else if (action === "series") {
      renderBrowser("series");
      show("channels");
    } else if (action === "categoryAll") {
      browseCategory = "";
      browseSearch = "";
      document.getElementById("browserSearch").value = "";
      document.getElementById("searchBox").classList.remove("active");
      renderBrowserContents();
    } else if (action === "categoryFavorites") {
      browseCategory = "__favorites__";
      browseSearch = "";
      document.getElementById("browserSearch").value = "";
      document.getElementById("searchBox").classList.remove("active");
      renderBrowserContents();
    } else if (action === "categoryContinue") {
      browseCategory = "__continue__";
      browseSearch = "";
      document.getElementById("browserSearch").value = "";
      document.getElementById("searchBox").classList.remove("active");
      renderBrowserContents();
    } else if (action === "categorySearch") {
      browseCategory = "";
      document.getElementById("searchBox").classList.add("active");
      document.getElementById("browserSearch").focus();
      renderBrowserContents();
    } else if (action === "toggleFavorite") {
      if (selectedCatalogIndex >= 0) toggleFavorite(selectedCatalogIndex);
    } else if (action === "previewSelected") {
      if (selectedCatalogIndex >= 0) preview(selectedCatalogIndex);
    } else if (action === "playSelected") {
      if (selectedCatalogIndex >= 0) play(selectedCatalogIndex);
    } else if (action === "playlists") {
      document.getElementById("tvPairCode").textContent = pairCode();
      document.getElementById("playlistMessage").textContent = "";
      show("playlists");
    } else if (action === "savePlaylist") {
      if (activeType === "m3u") {
        addM3U();
      } else {
        addXtream();
      }
    } else if (action === "usePlaylist") {
      var useId = button.dataset.playlistId;
      setActivePlaylist(useId).then(function () {
        var current = activePlaylist();
        document.getElementById("playlistMessage").textContent =
          current ? current.name + " agora está ativa." : "";
      });
    } else if (action === "testPlaylist") {
      testStoredPlaylist(button.dataset.playlistId);
    } else if (action === "refreshPlaylist") {
      refreshPlaylistById(
        button.dataset.playlistId,
        document.getElementById("playlistMessage")
      ).catch(function (error) {
        document.getElementById("playlistMessage").textContent =
          "Não foi possível atualizar: " +
          (error && error.message ? error.message : "erro desconhecido");
      });
    } else if (action === "editPlaylist") {
      beginPlaylistEdit(button.dataset.playlistId);
    } else if (action === "testPlaylistForm") {
      testPlaylistForm();
    } else if (action === "cancelPlaylistEdit") {
      if (editingPlaylistId) {
        resetPlaylistEditor();
      } else {
        goBack();
      }
    } else if (action === "removePlaylist") {
      var removeId = button.dataset.playlistId;
      var removedName = "";
      playlists.forEach(function (playlist) {
        if (playlist.id === removeId) removedName = playlist.name;
      });
      removePlaylist(removeId).then(function () {
        document.getElementById("playlistMessage").textContent =
          removedName ? removedName + " foi removida." : "Playlist removida.";
      });
    } else if (action === "playerPrev") {
      playNeighbor(-1);
    } else if (action === "playerNext") {
      playNeighbor(1);
    } else if (action === "retryPlayer") {
      retryCurrentStream();
    } else if (action === "cyclePlayerFit") {
      cyclePlayerFitMode();
    } else if (action === "skipIntro") {
      var playerVideo = document.getElementById("video");
      if (playerVideo && currentPlaybackKind === "series") {
        var targetTime =
          (playerVideo.currentTime || 0) + readIntroDuration();
        if (isFinite(playerVideo.duration) && playerVideo.duration > 0) {
          targetTime = Math.min(
            targetTime,
            Math.max(0, playerVideo.duration - 5)
          );
        }
        try {
          playerVideo.currentTime = targetTime;
        } catch (error) {}
        document.getElementById("skipIntro").classList.remove("visible");
      }
    } else if (action === "playMovieDetail") {
      if (currentMovieIndex >= 0) play(currentMovieIndex);
    } else if (action === "favoriteMovieDetail") {
      if (currentMovieIndex >= 0) {
        toggleFavorite(currentMovieIndex);
        refreshMovieDetail();
      }
    } else if (action === "continueSeries") {
      continueCurrentSeries();
    } else if (action === "toggleEpisodeWatched") {
      toggleSelectedEpisodeWatched();
    } else if (action === "cycleIntroDuration") {
      cycleIntroDuration();
    } else if (action === "nextEpisode") {
      if (currentNextEpisode) {
        playSeriesEpisode(currentNextEpisode);
      }
    } else if (action === "settings") {
      openSettings();
    } else if (action === "testConnection") {
      testConnection();
    } else if (action === "refreshActive") {
      refreshActivePlaylist();
    } else if (action === "clearCache") {
      clearTemporaryCache();
      document.getElementById("settingsMessage").textContent =
        "Cache temporário e progresso local foram limpos. Playlists e favoritos foram mantidos.";
    } else if (action === "reload") {
      loadPlaylists().then(function () {
        var current = activePlaylist();
        document.getElementById("status").textContent =
          current ? "Playlist: " + current.name : "TV não vinculada";
      });
    } else if (action === "back" || action === "backChannels") {
      goBack();
    }
  });

  var playerScreenElement = document.getElementById("player");
  if (playerScreenElement) {
    playerScreenElement.addEventListener("mousemove", showPlayerUi);
    playerScreenElement.addEventListener("click", showPlayerUi);
  }

  document.getElementById("browserSearch").addEventListener("input", function () {
    browseSearch = this.value.trim();
    browseCategory = "";
    renderBrowserContents();
  });

  ["smartBandwidth", "resumePlayback", "previewAudio"].forEach(function (id) {
    var input = document.getElementById(id);
    if (input) {
      input.addEventListener("change", function () {
        saveSettings();
        var row = document.querySelector(
          '.setting-row[data-setting-target="' + id + '"]'
        );
        if (row) row.setAttribute("aria-checked", input.checked ? "true" : "false");

        var message = document.getElementById("settingsMessage");
        if (message) {
          message.textContent =
            "Configuração salva. A economia inteligente reduz apenas o consumo da prévia; a tela cheia continua em qualidade automática.";
        }
      });
    }
  });

  document.querySelectorAll(".source-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      if (editingPlaylistId) {
        var editing = playlistById(editingPlaylistId);
        if (editing && editing.type !== tab.dataset.source) {
          document.getElementById("playlistMessage").textContent =
            "Para trocar o tipo da playlist, remova esta e adicione uma nova.";
          return;
        }
      }

      activatePlaylistSourceTab(tab.dataset.source);
    });
  });

  document.addEventListener("keydown", function (event) {
    var activeScreen = document.querySelector(".screen.active");
    var current = document.activeElement;
    var isBackKey =
      event.keyCode === 461 ||
      event.which === 461 ||
      event.key === "Escape";

    if (current && /INPUT|TEXTAREA/.test(current.tagName)) {
      if (isBackKey) {
        event.preventDefault();
        event.stopPropagation();

        var inputFocusables = activeScreen
          ? Array.prototype.slice
              .call(activeScreen.querySelectorAll(".focusable"))
              .filter(function (item) {
                return item.offsetParent !== null && !item.disabled;
              })
          : [];
        var inputIndex = inputFocusables.indexOf(current);
        var nextInputFocus =
          inputIndex >= 0 && inputIndex + 1 < inputFocusables.length
            ? inputFocusables[inputIndex + 1]
            : null;

        current.blur();
        if (nextInputFocus) {
          try {
            nextInputFocus.focus({ preventScroll: true });
          } catch (error) {
            nextInputFocus.focus();
          }
        }
        return;
      }

      if (
        event.key === "Enter" ||
        event.keyCode === 13 ||
        event.which === 13
      ) {
        var editableFields = activeScreen
          ? Array.prototype.slice
              .call(activeScreen.querySelectorAll("input, textarea"))
              .filter(function (item) {
                return item.offsetParent !== null && !item.disabled;
              })
          : [];
        var fieldIndex = editableFields.indexOf(current);
        var nextField =
          fieldIndex >= 0 && fieldIndex + 1 < editableFields.length
            ? editableFields[fieldIndex + 1]
            : null;

        if (nextField) {
          event.preventDefault();
          event.stopPropagation();
          current.blur();
          try {
            nextField.focus({ preventScroll: true });
          } catch (error) {
            nextField.focus();
          }
        }
        return;
      }

      return;
    }

    if (activeScreen && activeScreen.id === "player") {
      showPlayerUi();
    }

    function focusElement(element) {
      if (!element) return;
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        element.focus();
      }
      if (element.scrollIntoView) {
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    if (activeScreen && activeScreen.id === "home") {
      var tiles = Array.prototype.slice.call(
        activeScreen.querySelectorAll(".tile")
      );
      var refreshButton = activeScreen.querySelector(".refresh");
      var tileIndex = tiles.indexOf(current);

      if (event.key === "ArrowRight" && tileIndex >= 0) {
        event.preventDefault();
        focusElement(tiles[Math.min(tileIndex + 1, tiles.length - 1)]);
        return;
      }
      if (event.key === "ArrowLeft" && tileIndex >= 0) {
        event.preventDefault();
        focusElement(tiles[Math.max(tileIndex - 1, 0)]);
        return;
      }
      if (event.key === "ArrowDown" && tileIndex >= 0) {
        event.preventDefault();
        focusElement(refreshButton);
        return;
      }
      if (event.key === "ArrowUp" && current === refreshButton) {
        event.preventDefault();
        focusElement(tiles[Math.floor(tiles.length / 2)]);
        return;
      }
    }

    if (activeScreen && activeScreen.id === "settings") {
      var settingRows = Array.prototype.slice.call(
        activeScreen.querySelectorAll(".setting-row")
      );
      var connectionActions = Array.prototype.slice.call(
        activeScreen.querySelectorAll(".settings-card:nth-child(2) .settings-action")
      );
      var appActions = Array.prototype.slice.call(
        activeScreen.querySelectorAll(".settings-card:nth-child(3) .settings-action")
      );
      var backButton = activeScreen.querySelector(".browser-back");
      var settingIndex = settingRows.indexOf(current);
      var connectionIndex = connectionActions.indexOf(current);
      var appIndex = appActions.indexOf(current);

      if (settingIndex >= 0) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          current.click();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusElement(settingRows[Math.min(settingIndex + 1, settingRows.length - 1)]);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          focusElement(settingIndex > 0 ? settingRows[settingIndex - 1] : backButton);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          focusElement(connectionActions[Math.min(settingIndex, connectionActions.length - 1)]);
          return;
        }
      }

      if (connectionIndex >= 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusElement(connectionActions[Math.min(connectionIndex + 1, connectionActions.length - 1)]);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          focusElement(connectionIndex > 0 ? connectionActions[connectionIndex - 1] : backButton);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          focusElement(settingRows[Math.min(connectionIndex, settingRows.length - 1)]);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          focusElement(appActions[0]);
          return;
        }
      }

      if (appIndex >= 0) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          focusElement(connectionActions[Math.min(appIndex, connectionActions.length - 1)]);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          focusElement(backButton);
          return;
        }
      }

      if (current === backButton && event.key === "ArrowDown") {
        event.preventDefault();
        focusElement(settingRows[0]);
        return;
      }
    }

    if (activeScreen && activeScreen.id === "channels") {
      var isContentRow =
        current && current.classList.contains("content-row");
      var isCategoryControl =
        current &&
        (current.classList.contains("category-button") ||
          current.classList.contains("category-item"));

      if (
        isCategoryControl &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();

        var categoryNavigation = Array.prototype.slice
          .call(
            activeScreen.querySelectorAll(
              '.category-button:not([data-action="categorySearch"]), #categoryList .category-item'
            )
          )
          .filter(function (item) {
            return item.offsetParent !== null && !item.disabled;
          });

        var categoryIndex = categoryNavigation.indexOf(current);

        if (categoryIndex >= 0) {
          var categoryTargetIndex =
            event.key === "ArrowDown"
              ? Math.min(categoryIndex + 1, categoryNavigation.length - 1)
              : Math.max(categoryIndex - 1, 0);
          focusElement(categoryNavigation[categoryTargetIndex]);
          return;
        }

        if (
          current.classList.contains("category-button") &&
          current.dataset.action === "categorySearch"
        ) {
          var categoryFallback =
            event.key === "ArrowDown"
              ? document.querySelector("#categoryList .category-item")
              : categoryNavigation[categoryNavigation.length - 1];
          if (categoryFallback) focusElement(categoryFallback);
          return;
        }
      }

      if (isContentRow && event.key === "ArrowDown") {
        event.preventDefault();

        var next = current.nextElementSibling;
        while (next && !next.classList.contains("focusable")) {
          next = next.nextElementSibling;
        }

        if (
          !next &&
          browseRenderMode === "live" &&
          browseRenderedCount < browseRenderEntries.length
        ) {
          appendLiveRows(document.getElementById("channelGrid"));
          next = current.nextElementSibling;
        }

        if (next) focusElement(next);
        return;
      }

      if (isContentRow && event.key === "ArrowUp") {
        event.preventDefault();

        var previous = current.previousElementSibling;
        while (previous && !previous.classList.contains("focusable")) {
          previous = previous.previousElementSibling;
        }
        if (previous) focusElement(previous);
        return;
      }
    }

    if (
      activeScreen &&
      activeScreen.id === "seriesDetail" &&
      current &&
      current.classList.contains("episode-row") &&
      event.key === "ArrowDown"
    ) {
      event.preventDefault();

      var nextEpisodeRow = current.nextElementSibling;
      if (
        !nextEpisodeRow &&
        episodeRenderedCount < episodeRenderEntries.length
      ) {
        appendEpisodeRows(document.getElementById("episodeList"));
        nextEpisodeRow = current.nextElementSibling;
      }

      if (nextEpisodeRow) focusElement(nextEpisodeRow);
      return;
    }

    if (
      activeScreen &&
      activeScreen.id === "player" &&
      currentPlaybackKind === "live" &&
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      playNeighbor(-1);
      return;
    }

    if (
      activeScreen &&
      activeScreen.id === "player" &&
      currentPlaybackKind === "live" &&
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      playNeighbor(1);
      return;
    }

    if (
      document.getElementById("player").classList.contains("active") &&
      (event.keyCode === 427 || event.key === "PageUp")
    ) {
      event.preventDefault();
      playNeighbor(1);
      return;
    }

    if (
      document.getElementById("player").classList.contains("active") &&
      (event.keyCode === 428 || event.key === "PageDown")
    ) {
      event.preventDefault();
      playNeighbor(-1);
      return;
    }

    var list = Array.prototype.slice
      .call(document.querySelectorAll(".screen.active .focusable"))
      .filter(function (item) {
        return item.offsetParent !== null && !item.disabled;
      });

    function focusByDirection(direction) {
      if (!list.length) return;

      var currentElement = document.activeElement;
      if (list.indexOf(currentElement) < 0) {
        focusElement(list[0]);
        return;
      }

      var from = currentElement.getBoundingClientRect();
      var fx = from.left + from.width / 2;
      var fy = from.top + from.height / 2;
      var best = null;
      var bestScore = Infinity;

      list.forEach(function (candidate) {
        if (candidate === currentElement) return;

        var box = candidate.getBoundingClientRect();
        if (
          box.bottom < 0 ||
          box.top > window.innerHeight ||
          box.right < 0 ||
          box.left > window.innerWidth
        ) {
          return;
        }

        var cx = box.left + box.width / 2;
        var cy = box.top + box.height / 2;
        var dx = cx - fx;
        var dy = cy - fy;

        if (direction === "right" && dx <= 4) return;
        if (direction === "left" && dx >= -4) return;
        if (direction === "down" && dy <= 4) return;
        if (direction === "up" && dy >= -4) return;

        var primary =
          direction === "left" || direction === "right"
            ? Math.abs(dx)
            : Math.abs(dy);
        var secondary =
          direction === "left" || direction === "right"
            ? Math.abs(dy)
            : Math.abs(dx);

        var score = primary + secondary * 2;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      });

      focusElement(best);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusByDirection("right");
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusByDirection("left");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusByDirection("down");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusByDirection("up");
      return;
    }

    if (isBackKey) {
      event.preventDefault();
      event.stopPropagation();

      if (activeScreen && activeScreen.id === "home") {
        var now = Date.now();
        if (now - lastRootBackAt <= ROOT_BACK_EXIT_WINDOW) {
          lastRootBackAt = 0;
          window.close();
          return;
        }

        lastRootBackAt = now;
        var status = document.getElementById("status");
        if (status) status.textContent = "Pressione Voltar novamente para sair";
        return;
      }

      lastRootBackAt = 0;
      goBack();
    }
  });

  async function bootstrap() {
    loadSettings();
    loadPlayerFitMode();
    bindPlayerEvents();
    bindProgressiveBrowseScroll();
    await loadPlaylists();
    renderBrowser("live");
    focusFirst();
  }

  bootstrap();
})();