# Open Video Downloader (Non-DRM)

This Chrome extension adds a small "Download" button on HTML5 `<video>` elements and lets you download:

- Direct video URLs (e.g., MP4 files) using Chrome's downloads API
- Non-DRM, MSE/`blob:` videos by recording the element via `captureStream` + `MediaRecorder` (when the site and browser allow it)

It will NOT bypass DRM or site protections. Many streaming services (including MX Player for premium/protected content) use DRM or encrypted streaming; this extension cannot and will not download those.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Turn on "Developer mode" (top-right)
3. Click "Load unpacked" and select this folder: `mx-downloader-extension`

## Usage

- Navigate to a page with an HTML5 video
- A "Download" button will appear on the top-left of the video
- Click it:
  - If the video has a direct HTTP(S) `src`, Chrome will download the file
  - If the video is an MSE/`blob:` source and not protected by DRM, the extension will attempt to record it and save as WebM

Notes:
- Live streams (infinite duration) are not supported by the capture mode
- DRM-protected videos disable capture and will fail

## Legal

- Only download content that you own or have explicit permission to download
- Respect the website's Terms of Service and local laws
- This project is for educational purposes and is not intended to circumvent DRM or other protections

## Troubleshooting

- If the button does not appear, the video element may be encapsulated in a shadow DOM or an iframe that disallows script injection
- If capture fails, the video is likely protected (DRM) or blocked by browser security
- Some sites require you to start playback before a usable `currentSrc` is available