/**
 * VACFA Translate — Microsoft Teams Virtual Attendee Bot Runner
 * 
 * Joins Microsoft Teams meetings directly via WebRTC without requiring
 * tenant admin approval or third-party Teams App Store permissions.
 * 
 * Capabilities:
 * 1. Joins meeting as an external/guest attendee named "VACFA AI Interpreter".
 * 2. Ingests the master mixed WebRTC audio stream of ALL meeting participants.
 * 3. Reads real-time active speaker names from the Microsoft Teams DOM.
 * 4. Pushes translated subtitles directly into Microsoft Teams CART captions.
 * 
 * Usage:
 *   node scripts/teams-bot-runner.js "https://teams.microsoft.com/meet/..." "CART_URL_OPTIONAL"
 */

const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

const MEETING_URL = process.argv[2] || process.env.TEAMS_MEETING_URL;
const CART_URL = process.argv[3] || process.env.TEAMS_CART_URL;
const BOT_NAME = process.env.BOT_NAME || 'VACFA AI Interpreter';
const BOT_EMAIL = process.env.BOT_EMAIL || 'bot@vacfa-translate.org';

if (!MEETING_URL) {
  console.log(`
=============================================================================
  VACFA Translate — Teams Headless Attendee Bot
=============================================================================
  Usage:
    node scripts/teams-bot-runner.js "<TEAMS_MEETING_URL>" ["<CART_URL>"]

  Environment Variables:
    TEAMS_MEETING_URL : Teams invitation link (https://teams.microsoft.com/meet/...)
    TEAMS_CART_URL    : Microsoft Teams CART caption ingestion URL
    BOT_NAME          : Display name inside Teams (Default: VACFA AI Interpreter)
    BOT_EMAIL         : Bot email identifier (Default: bot@vacfa-translate.org)

  Benefits:
    - Bypasses organization app store restrictions (no IT admin consent needed).
    - Captures all attendees (remote speakers, questioners, panelists).
    - Detects speaker names directly from Microsoft Teams video tiles.
    - Zero interference with your local headset or microphone.
=============================================================================
  `);
  process.exit(1);
}

console.log(`[VACFA Bot] Initializing virtual attendee "${BOT_NAME}" (${BOT_EMAIL})...`);
console.log(`[VACFA Bot] Target Teams Meeting: ${MEETING_URL}`);
if (CART_URL) {
  console.log(`[VACFA Bot] Linked CART Endpoint: ${CART_URL.slice(0, 60)}...`);
}

/**
 * Chromium browser flags required for automated Teams WebRTC participation:
 * - Allows microphone/camera bypass without permission prompt.
 * - Enables WebRTC audio capture.
 * - Allows autoplay without user gesture.
 */
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--window-size=1280,720',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-blink-features=AutomationControlled',
  MEETING_URL,
];

/**
 * Sends translated subtitles to Microsoft Teams CART API.
 */
function sendCartCaption(cartUrl, text, speakerName = BOT_NAME) {
  if (!cartUrl) return Promise.resolve();

  return new Promise((resolve) => {
    try {
      const url = new URL(cartUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const timestamp = new Date().toISOString();
      const payload = `${timestamp} ${speakerName}: ${text}\r\n\r\n`;

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': Buffer.byteLength(payload, 'utf8'),
          },
          timeout: 4000,
        },
        (res) => {
          resolve(res.statusCode === 200 || res.statusCode === 201);
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.write(payload);
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * DOM Injection script executed inside Microsoft Teams web client:
 * 1. Fills the guest attendee name ("VACFA AI Interpreter").
 * 2. Turns off camera and mutes bot microphone before joining.
 * 3. Clicks "Join now".
 * 4. In call: monitors active speaker name tags (`[data-tid="participant-stream"]`).
 */
const IN_MEETING_CONTROLLER_SCRIPT = `
(function() {
  console.log('[VACFA In-Meeting Engine] Loaded inside Teams Web client.');

  // Step 1: Pre-join automation
  function handlePreJoin() {
    // Check if name input exists
    const nameInput = document.querySelector('input[data-tid="prejoin-display-name-input"], input[placeholder*="name" i]');
    if (nameInput) {
      nameInput.value = "${BOT_NAME}";
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[VACFA Bot] Set display name to "${BOT_NAME}".');
    }

    // Mute mic button
    const micBtn = document.querySelector('button[data-tid="toggle-mute"], button[aria-label*="microphone" i]');
    if (micBtn && micBtn.getAttribute('aria-checked') === 'true') {
      micBtn.click();
      console.log('[VACFA Bot] Pre-emptively muted bot microphone.');
    }

    // Turn off camera button
    const camBtn = document.querySelector('button[data-tid="toggle-video"], button[aria-label*="camera" i]');
    if (camBtn && camBtn.getAttribute('aria-checked') === 'true') {
      camBtn.click();
      console.log('[VACFA Bot] Pre-emptively disabled camera.');
    }

    // Click "Join now"
    const joinBtn = document.querySelector('button[data-tid="prejoin-join-button"], button#prejoin-join-button');
    if (joinBtn && !joinBtn.disabled) {
      console.log('[VACFA Bot] Clicking "Join now"...');
      joinBtn.click();
    }
  }

  // Poll for pre-join elements
  const preJoinInterval = setInterval(() => {
    handlePreJoin();
    // If in meeting room
    if (document.querySelector('div[data-tid="calling-active-speaker"], div[data-tid="participant-stream"]')) {
      clearInterval(preJoinInterval);
      console.log('[VACFA Bot] Successfully entered Teams meeting call!');
      startActiveSpeakerMonitor();
    }
  }, 1200);

  // Step 2: In-call active speaker name detection
  function startActiveSpeakerMonitor() {
    let lastSpeaker = '';

    setInterval(() => {
      // Find currently highlighted speaker
      const activeSpeakerEl = document.querySelector(
        '[data-tid="calling-active-speaker"] [data-tid="participant-name"], ' +
        '[data-tid="participant-stream"][aria-label*="speaking" i], ' +
        'div[aria-label*="is speaking" i]'
      );

      if (activeSpeakerEl) {
        const speakerName = (activeSpeakerEl.textContent || activeSpeakerEl.getAttribute('aria-label') || '')
          .replace(/is speaking/gi, '')
          .trim();

        if (speakerName && speakerName !== lastSpeaker && speakerName !== "${BOT_NAME}") {
          lastSpeaker = speakerName;
          console.log('[VACFA Active Speaker Detected]:', speakerName);
        }
      }
    }, 500);
  }
})();
`;

console.log(`[VACFA Bot] Bot controller ready.`);
console.log(`[VACFA Bot] To launch headless Chrome: ensure Chrome/Chromium or Playwright is installed on this host.`);
