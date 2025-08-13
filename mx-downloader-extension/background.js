// Listens for download requests from the content script and triggers Chrome's download API
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'downloadUrl' && typeof message.url === 'string') {
    const filename = message.filename || `video-${Date.now()}.mp4`;
    chrome.downloads.download(
      {
        url: message.url,
        filename,
        saveAs: true,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );
    // Keep the message channel open for async response
    return true;
  }
});