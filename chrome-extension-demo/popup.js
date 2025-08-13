async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id;
}

async function runOnActiveTab(fn) {
  const tabId = await getActiveTabId();
  if (!tabId) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: fn,
  });
}

document.getElementById('apply').addEventListener('click', () => {
  runOnActiveTab(() => {
    document.documentElement.setAttribute('data-cc-demo', 'peach');
    document.body.style.transition = 'background-color 160ms ease';
    document.body.style.backgroundColor = '#FFE5D0';
  });
});

document.getElementById('reset').addEventListener('click', () => {
  runOnActiveTab(() => {
    document.documentElement.removeAttribute('data-cc-demo');
    document.body.style.backgroundColor = '';
  });
});