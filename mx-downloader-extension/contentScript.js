(function () {
  const BUTTON_CLASS = 'mxdl-btn';
  const CONTAINER_CLASS = 'mxdl-container';
  const DATA_FLAG = 'mxdlAttached';

  function toKebabCase(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'video';
  }

  function guessExtensionFromMime(mimeType) {
    if (!mimeType) return 'webm';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('ogg') || mimeType.includes('ogv')) return 'ogv';
    return 'webm';
  }

  function extensionFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const last = pathname.split('/').pop() || '';
      const idx = last.lastIndexOf('.');
      if (idx > 0) return last.slice(idx + 1).split('?')[0].split('#')[0];
    } catch (_) {
      // ignore
    }
    return 'mp4';
  }

  function isStreamingUrl(url) {
    if (!url) return false;
    const u = url.split('?')[0].toLowerCase();
    return (
      u.endsWith('.m3u8') ||
      u.endsWith('.mpd') ||
      u.includes('/dash/') ||
      u.includes('/hls/')
    );
  }

  function generateFilename(base, ext) {
    const host = location.hostname.replace(/^www\./, '');
    const title = toKebabCase(document.title);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBase = toKebabCase(base || title || host);
    return `${host}-${safeBase}-${stamp}.${ext}`;
  }

  function pickSupportedMime() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return 'video/webm';
  }

  async function downloadDirect(url, preferredName) {
    const ext = extensionFromUrl(url);
    const filename = preferredName || generateFilename('', ext);
    try {
      chrome.runtime.sendMessage({ type: 'downloadUrl', url, filename });
    } catch (err) {
      // Fallback via an anchor in page context
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  async function downloadFromBlob(blob, suggestedBaseName) {
    const ext = guessExtensionFromMime(blob.type);
    const filename = generateFilename(suggestedBaseName, ext);
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  function waitForEvent(target, event, timeoutMs) {
    return new Promise((resolve, reject) => {
      const onEvent = () => { cleanup(); resolve(); };
      const onTimeout = () => { cleanup(); reject(new Error('timeout')); };
      let to;
      function cleanup() {
        target.removeEventListener(event, onEvent);
        if (to) clearTimeout(to);
      }
      target.addEventListener(event, onEvent, { once: true });
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        to = setTimeout(onTimeout, timeoutMs);
      }
    });
  }

  async function captureAndDownload(video) {
    if (!video || typeof video.captureStream !== 'function') {
      alert('This video cannot be captured. It may be protected or the browser blocked capture.');
      return;
    }

    if (video.readyState < 1) {
      try { await waitForEvent(video, 'loadedmetadata', 8000); } catch (_) {}
    }

    if (!Number.isFinite(video.duration) || video.duration === Infinity || video.duration <= 0) {
      alert('Live streams or unknown durations are not supported for capture.');
      return;
    }

    const targetDuration = video.duration;
    const stream = video.captureStream();
    const mimeType = pickSupportedMime();

    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (e) {
      try { recorder = new MediaRecorder(stream); } catch (e2) {
        console.error('MediaRecorder init failed', e, e2);
        alert('Recording is not supported on this page.');
        return;
      }
    }

    const chunks = [];
    recorder.addEventListener('dataavailable', (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    });

    const stopped = new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
    });

    const wasPaused = video.paused;
    const prevMuted = video.muted;
    const prevRate = video.playbackRate;

    const progressWatcher = { intervalId: null };

    function startProgressWatcher() {
      progressWatcher.intervalId = setInterval(() => {
        if (video.paused) {
          video.play().catch(() => {});
        }
      }, 2000);
    }

    function stopProgressWatcher() {
      if (progressWatcher.intervalId) clearInterval(progressWatcher.intervalId);
    }

    try {
      video.muted = true;
      video.playbackRate = 1.0;
      try { video.currentTime = 0; } catch (_) {}

      recorder.start(1000);
      await video.play().catch(() => {});
      startProgressWatcher();

      const reachedEnd = new Promise((resolve) => {
        const onTimeUpdate = () => {
          if (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.25) {
            cleanup();
            resolve();
          }
        };
        const onEnded = () => { cleanup(); resolve(); };
        function cleanup() {
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.removeEventListener('ended', onEnded);
        }
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded, { once: true });
      });

      // Wait up to duration + small buffer (in ms)
      const maxWait = Math.min(Math.max(targetDuration * 1000 + 3000, 10_000), 6 * 60 * 60 * 1000);
      await Promise.race([
        reachedEnd,
        new Promise((resolve) => setTimeout(resolve, maxWait))
      ]);

      try { recorder.stop(); } catch (_) {}
      await stopped;

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      await downloadFromBlob(blob, toKebabCase(document.title || 'video'));
    } catch (err) {
      console.error('Capture failed:', err);
      alert('Capture failed. The video may be protected (DRM) or blocked by browser security.');
    } finally {
      stopProgressWatcher();
      try { video.muted = prevMuted; } catch (_) {}
      try { video.playbackRate = prevRate; } catch (_) {}
      if (wasPaused) {
        try { video.pause(); } catch (_) {}
      }
    }
  }

  function attachButton(video) {
    if (!video || video.dataset[DATA_FLAG]) return;
    video.dataset[DATA_FLAG] = '1';

    const container = document.createElement('div');
    container.className = CONTAINER_CLASS;

    const button = document.createElement('button');
    button.className = BUTTON_CLASS;
    button.textContent = 'Download';

    container.appendChild(button);

    const parent = video.parentElement;
    if (!parent) return;
    const computed = window.getComputedStyle(parent);
    if (computed.position === 'static') {
      parent.style.position = 'relative';
    }
    parent.appendChild(container);

    button.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const directUrl = video.currentSrc || video.src || '';
      if (/^https?:\/\//i.test(directUrl) && !isStreamingUrl(directUrl)) {
        await downloadDirect(directUrl);
        return;
      }

      await captureAndDownload(video);
    });
  }

  function scan() {
    const videos = document.querySelectorAll('video');
    videos.forEach(attachButton);
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'mxdl_scan') {
        const videos = Array.from(document.querySelectorAll('video'));
        const results = videos.map((v) => ({
          currentSrc: v.currentSrc || v.src || '',
          isPaused: !!v.paused,
          duration: Number.isFinite(v.duration) ? v.duration : null
        }));
        sendResponse({ ok: true, count: videos.length, results });
        return true;
      }
    });
  } catch (_) {
    // ignore
  }
})();