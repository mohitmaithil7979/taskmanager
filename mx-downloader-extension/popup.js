function updateStatus(text) {
  document.getElementById('status').textContent = text;
}

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0]);
    });
  });
}

async function sendScan(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'mxdl_scan' }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { ok: false, error: 'No response' });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

async function scanNow() {
  updateStatus('Scanning...');
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    updateStatus('No active tab.');
    return;
  }
  const result = await sendScan(tab.id);
  if (!result || !result.ok) {
    updateStatus(`No videos found or cannot access this page. ${result && result.error ? '(' + result.error + ')' : ''}`);
    return;
  }
  const { count, results } = result;
  if (!count) {
    updateStatus('No <video> elements detected. Start playback or try another page.');
    return;
  }
  const lines = results.map((r, i) => `${i + 1}. ${r.currentSrc || '(blob/MSE or no direct src)'}${r.duration ? ` [${Math.round(r.duration)}s]` : ''}`);
  updateStatus(`${count} video(s) detected:\n` + lines.join('\n'));
}

document.getElementById('rescan').addEventListener('click', scanNow);

scanNow();