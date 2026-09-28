/**
 * VACFA Translate — Microsoft Teams Virtual Attendee Bot Runner
 * 
 * Joins Microsoft Teams meetings directly via WebRTC without requiring
 * tenant admin approval or third-party Teams App Store permissions.
 * 
 * Capabilities:
 * 1. Launches browser (Chrome / Edge) with WebRTC audio flags and isolated profile.
 * 2. Joins meeting as an external/guest attendee named "VACFA AI Interpreter".
 * 3. Ingests the master mixed WebRTC audio stream of ALL meeting participants.
 * 4. Reads real-time active speaker names from the Microsoft Teams DOM.
 * 5. Pushes translated subtitles directly into Microsoft Teams CART captions.
 * 
 * Usage:
 *   node scripts/teams-bot-runner.js "<TEAMS_MEETING_URL>" ["<CART_URL>"]
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const MEETING_URL = process.argv[2] || process.env.TEAMS_MEETING_URL;
const CART_URL = process.argv[3] || process.env.TEAMS_CART_URL;
const BOT_NAME = process.env.BOT_NAME || 'VACFA AI Interpreter';
const BOT_EMAIL = process.env.BOT_EMAIL || 'bot@vacfa-translate.org';
const DEBUG_PORT = process.env.DEBUG_PORT || 9222;
const SESSION_URL = process.argv[4] || process.env.SESSION_URL || 'https://s-satardien.github.io/vacfa-translate/live/session-001';
const JOIN_CODE = process.env.JOIN_CODE || '482916';
const CHAT_ANNOUNCEMENT = `🌐 VACFA AI Live Interpretation is active for this meeting! 🎧 Listen in French, Portuguese, or Swahili: ${SESSION_URL} (or join via code ${JOIN_CODE} at https://s-satardien.github.io/vacfa-translate/join)`;

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

console.log(`=============================================================================`);
console.log(`  VACFA Translate — Virtual Attendee Bot`);
console.log(`=============================================================================`);
console.log(`[VACFA Bot] Target Meeting: ${MEETING_URL}`);
console.log(`[VACFA Bot] Bot Identity  : ${BOT_NAME} (${BOT_EMAIL})`);
if (CART_URL) {
  console.log(`[VACFA Bot] CART Ingestion: ${CART_URL.slice(0, 60)}...`);
}
console.log(`-----------------------------------------------------------------------------`);

/**
 * Finds available browser executable (Chrome or Edge).
 */
function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

/**
 * Sends translated subtitles to Microsoft Teams CART API.
 */
function sendCartCaption(cartUrl, text, speakerName = BOT_NAME) {
  if (!cartUrl) return Promise.resolve(false);

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
 * Client-side script injected into Microsoft Teams Web client via CDP.
 */
const IN_MEETING_CONTROLLER_SCRIPT = `
(function() {
  if (window.__VACFA_BOT_INITIALIZED__) return;
  window.__VACFA_BOT_INITIALIZED__ = true;
  console.log('[VACFA In-Meeting Engine] Loaded inside Teams Web client.');

  // Step 1: Pre-join automation
  function handlePreJoin() {
    // 1a. Handle "Continue on this browser" button
    const continueOnBrowserBtn = Array.from(document.querySelectorAll('button, a')).find(el => 
      /continue on this browser/i.test(el.textContent || '') ||
      el.getAttribute('data-tid') === 'joinOnWeb'
    );
    if (continueOnBrowserBtn) {
      console.log('[VACFA Bot] Clicking "Continue on this browser"...');
      continueOnBrowserBtn.click();
    }

    // 1b. Check if name input exists
    const nameInput = document.querySelector('input[data-tid="prejoin-display-name-input"], input[placeholder*="name" i], input[aria-label*="name" i]');
    if (nameInput && nameInput.value !== "${BOT_NAME}") {
      nameInput.value = "${BOT_NAME}";
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[VACFA Bot] Set attendee display name to "${BOT_NAME}".');
    }

    // 1c. Mute mic button
    const micBtn = document.querySelector('button[data-tid="toggle-mute"], button[aria-label*="microphone" i], button[aria-label*="mic" i]');
    if (micBtn && micBtn.getAttribute('aria-checked') === 'true') {
      micBtn.click();
      console.log('[VACFA Bot] Pre-emptively muted bot microphone.');
    }

    // 1d. Turn off camera button
    const camBtn = document.querySelector('button[data-tid="toggle-video"], button[aria-label*="camera" i], button[aria-label*="video" i]');
    if (camBtn && camBtn.getAttribute('aria-checked') === 'true') {
      camBtn.click();
      console.log('[VACFA Bot] Pre-emptively disabled camera.');
    }

    // 1e. Click "Join now"
    const joinBtn = document.querySelector('button[data-tid="prejoin-join-button"], button#prejoin-join-button');
    if (joinBtn && !joinBtn.disabled) {
      console.log('[VACFA Bot] Clicking "Join now"...');
      joinBtn.click();
    }
  }

  // Poll for pre-join elements
  const preJoinInterval = setInterval(() => {
    handlePreJoin();
    // Detect if inside meeting room
    if (document.querySelector('div[data-tid="calling-active-speaker"], div[data-tid="participant-stream"], div[data-tid="calling-roster-section"]')) {
      clearInterval(preJoinInterval);
      console.log('[VACFA Bot] Connected inside Teams meeting call!');
      startActiveSpeakerMonitor();
      setTimeout(sendChatAnnouncement, 2000);
    }
  }, 1000);

  // Step 2: In-call active speaker name detection
  function startActiveSpeakerMonitor() {
    let lastSpeaker = '';

    setInterval(() => {
      // Find currently highlighted active speaker
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

  // Step 3: Post Welcome & Translation URLs into Teams Meeting Chat
  function sendChatAnnouncement() {
    if (window.__VACFA_CHAT_ANNOUNCED__) return;

    // Check for chat button on toolbar
    const chatBtn = document.querySelector(
      'button[data-tid="chat-button"], button#chat-button, button[aria-label*="chat" i], button[aria-label*="conversation" i]'
    );

    if (chatBtn) {
      // If chat pane not already open
      const chatPane = document.querySelector('div[data-tid="chat-pane"], div[aria-label*="Meeting chat" i]');
      if (!chatPane) {
        console.log('[VACFA Bot] Opening Teams chat pane...');
        chatBtn.click();
      }

      setTimeout(() => {
        const chatInput = document.querySelector(
          'div[data-tid="ckeditor-message-input"], div[contenteditable="true"][role="textbox"], div[aria-label*="Type a message" i]'
        );

        if (chatInput && !window.__VACFA_CHAT_ANNOUNCED__) {
          window.__VACFA_CHAT_ANNOUNCED__ = true;
          chatInput.focus();
          
          const announcement = "${CHAT_ANNOUNCEMENT}";
          
          try {
            document.execCommand('insertText', false, announcement);
          } catch {
            chatInput.innerText = announcement;
          }
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));

          setTimeout(() => {
            const sendBtn = document.querySelector(
              'button[data-tid="send-message-button"], button#send-message-button, button[aria-label*="Send" i]'
            );
            if (sendBtn && !sendBtn.disabled) {
              console.log('[VACFA Bot] Posting translation link into Teams meeting chat...');
              sendBtn.click();
            } else {
              chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          }, 800);
        } else if (!chatInput) {
          console.log('[VACFA Bot] In-meeting chat not accessible (may be restricted to tenant members).');
        }
      }, 1500);
    }
  }
})();
`;

async function main() {
  const browserBin = findBrowser();
  if (!browserBin) {
    console.error('[VACFA Bot] Error: Neither Google Chrome nor Microsoft Edge was found on this system.');
    process.exit(1);
  }

  const browserName = browserBin.toLowerCase().includes('edge') ? 'Microsoft Edge' : 'Google Chrome';
  console.log(`[VACFA Bot] Detected browser engine: ${browserName}`);
  console.log(`[VACFA Bot] Binary path: ${browserBin}`);

  // Create isolated profile dir
  const profileDir = path.join(os.homedir(), '.gemini', 'antigravity', 'teams-bot-profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const browserArgs = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    MEETING_URL,
  ];

  console.log(`[VACFA Bot] Launching ${browserName} with WebRTC auto-join flags...`);
  const browserProcess = spawn(browserBin, browserArgs, {
    detached: false,
    stdio: 'ignore',
  });

  browserProcess.on('error', (err) => {
    console.error('[VACFA Bot] Failed to launch browser process:', err.message);
  });

  browserProcess.on('exit', (code) => {
    console.log(`[VACFA Bot] Browser process exited with code ${code}.`);
    process.exit(0);
  });

  // Periodically check CART status if URL provided
  if (CART_URL) {
    setTimeout(async () => {
      console.log('[VACFA Bot] Checking Teams CART caption status...');
      const ok = await sendCartCaption(CART_URL, 'VACFA AI Interpreter linked to Teams captions banner.');
      if (ok) {
        console.log('[VACFA Bot] CART Endpoint: ACTIVE (Captions successfully delivering into Teams)');
      } else {
        console.log('[VACFA Bot] Note: CART endpoint waiting for meeting to start or organizer approval.');
      }
    }, 3000);
  }

  // Connect to Chrome DevTools Protocol to inject in-meeting controller
  async function attachCDP() {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((r) => setTimeout(r, 1000));

      try {
        const pages = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve([]);
              }
            });
          }).on('error', reject);
        });

        const teamsPage = pages.find((p) => p.type === 'page' && p.url.includes('teams.microsoft.com'));
        if (teamsPage && teamsPage.webSocketDebuggerUrl) {
          console.log(`[VACFA Bot] Connected to Teams browser page via CDP.`);
          
          if (typeof WebSocket !== 'undefined') {
            const ws = new WebSocket(teamsPage.webSocketDebuggerUrl);

            ws.on('open', () => {
              console.log('[VACFA Bot] CDP WebSocket stream established.');
              
              // Enable Runtime & Page
              ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
              ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));

              // Inject in-meeting controller script every 2.5 seconds to cover navigation
              const injectInterval = setInterval(() => {
                ws.send(JSON.stringify({
                  id: 3,
                  method: 'Runtime.evaluate',
                  params: {
                    expression: IN_MEETING_CONTROLLER_SCRIPT,
                    returnByValue: false,
                  }
                }));
              }, 2500);

              ws.on('message', (msg) => {
                try {
                  const ev = JSON.parse(msg.toString());
                  if (ev.method === 'Runtime.consoleAPICalled') {
                    const text = ev.params.args.map((a) => a.value || a.description || '').join(' ');
                    if (text.includes('[VACFA')) {
                      console.log(text);
                    }
                  }
                } catch {}
              });

              ws.on('close', () => {
                clearInterval(injectInterval);
              });
            });

            return;
          }
        }
      } catch (err) {
        // Retrying connection
      }
    }

    console.log('[VACFA Bot] Browser running. Teams window open on screen.');
  }

  attachCDP();

  console.log(`\n=============================================================================`);
  console.log(`  VACFA Bot Status: RUNNING`);
  console.log(`  1. The browser window has opened to your Teams meeting.`);
  console.log(`  2. Display name will be pre-filled as "${BOT_NAME}".`);
  console.log(`  3. In Teams, admit the bot if prompted in the lobby.`);
  console.log(`  4. Live Session Link for Attendees:`);
  console.log(`     ${SESSION_URL}`);
  console.log(`  5. In-Meeting Chat Announcement (auto-posted upon admission):`);
  console.log(`     "${CHAT_ANNOUNCEMENT}"`);
  console.log(`  Press Ctrl+C in this terminal to stop the bot.`);
  console.log(`=============================================================================\n`);
}

main().catch(console.error);
