/**
 * VACFA Translate — Microsoft Teams Virtual Attendee Bot Runner
 * 
 * Joins Microsoft Teams meetings directly via WebRTC without requiring
 * tenant admin approval or third-party Teams App Store permissions.
 * 
 * Capabilities:
 * 1. Launches browser (Chrome / Edge) with WebRTC audio flags and isolated profile.
 * 2. Joins meeting as an external/guest attendee named "VACFA AI Interpreter".
 * 3. Ingests all meeting speakers via Microsoft Teams native Live Cloud Captions.
 * 4. Translates speech in real time across English, French, Portuguese, and Swahili using Google Gemini 3.8 Flash.
 * 5. Pushes translated subtitles directly into Microsoft Teams CART captions.
 * 6. Streams live speech and translations to the VACFA Web App via built-in SSE relay (port 9876).
 * 
 * Usage:
 *   node scripts/teams-bot-runner.js "<TEAMS_MEETING_URL>" ["<CART_URL>"] ["<SESSION_URL>"] ["<JOIN_CODE>"]
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

// Load environment variables from .env.local if present
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = match[2] || '';
          val = val.replace(/^['"]|['"]$/g, '').trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}
loadEnvLocal();

const DEFAULT_TEST2_MEETING_URL = 'https://teams.microsoft.com/meet/35898491838902?p=t69Kw3xIC3m9il84Z2';
const DEFAULT_TEST2_CART_URL = 'https://api.captions.office.microsoft.com/cartcaption?meetingid=%7b%22tId%22%3a%2292454335-564e-4ccf-b0b0-24445b8c03f7%22%2c%22oId%22%3a%224ddd5689-9ad7-4554-97c8-a3cc026a86c8%22%2c%22thId%22%3a%2219%3ameeting_NTNlNjcwYmYtNGYyNi00MjQ4LTkzNTYtZDRmNThhNTVlMTI0%40thread.v2%22%2c%22mId%22%3a%220%22%7d&token=drnt33k';

const MEETING_URL = process.argv[2] || process.env.TEAMS_MEETING_URL || DEFAULT_TEST2_MEETING_URL;
const CART_URL = process.argv[3] || process.env.TEAMS_CART_URL || DEFAULT_TEST2_CART_URL;
const BOT_NAME = process.env.BOT_NAME || 'VACFA AI Interpreter';
const BOT_EMAIL = process.env.BOT_EMAIL || 'bot@vacfa-translate.org';
const DEBUG_PORT = process.env.DEBUG_PORT || 9222;
const RELAY_PORT = 9876;
const SESSION_URL = process.argv[4] || process.env.SESSION_URL || 'https://s-satardien.github.io/vacfa-translate/live/session-008';
const JOIN_CODE = process.argv[5] || process.env.JOIN_CODE || '736532';
const CHAT_ANNOUNCEMENT = `🌐 VACFA AI Live Interpretation is active for this meeting! 🎧 Listen in French, Portuguese, or Swahili: ${SESSION_URL} (or join via code ${JOIN_CODE} at https://s-satardien.github.io/vacfa-translate/join)`;

console.log(`=============================================================================`);
console.log(`  VACFA Translate — Virtual Attendee Bot`);
console.log(`=============================================================================`);
console.log(`[VACFA Bot] Target Meeting: ${MEETING_URL}`);
console.log(`[VACFA Bot] Bot Identity  : ${BOT_NAME} (${BOT_EMAIL})`);
console.log(`[VACFA Bot] Listener URL  : ${SESSION_URL} (Code: ${JOIN_CODE})`);
if (CART_URL) {
  console.log(`[VACFA Bot] CART Ingestion: ${CART_URL.slice(0, 60)}...`);
}
console.log(`-----------------------------------------------------------------------------`);

// ============================================================================
// 1. Local WebSocket & SSE Relay Server (Streams speech to VACFA Live Session App)
// ============================================================================
const sseClients = new Set();
let wss = null;

const relayServer = http.createServer((req, res) => {
  // Allow cross-origin requests from GitHub Pages or localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({ type: 'bot_status', connected: true, botName: BOT_NAME, meetingUrl: MEETING_URL, sessionUrl: SESSION_URL })}\n\n`);
    sseClients.add(res);
    console.log(`[VACFA Relay] Live session client connected via SSE (Total active web listeners: ${sseClients.size})`);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running', botName: BOT_NAME, clients: sseClients.size, meetingUrl: MEETING_URL }));
    return;
  }

  res.writeHead(404);
  res.end();
});

relayServer.listen(RELAY_PORT, '127.0.0.1', () => {
  console.log(`[VACFA Relay] Stream Server active on:`);
  console.log(`  - WebSocket : ws://127.0.0.1:${RELAY_PORT}`);
  console.log(`  - SSE Event : http://127.0.0.1:${RELAY_PORT}/events`);
});

try {
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server: relayServer });
  wss.on('connection', (client) => {
    console.log(`[VACFA Relay] Live session web app connected via WebSocket! (Total listeners: ${wss.clients.size})`);
    client.send(JSON.stringify({ type: 'bot_status', connected: true, botName: BOT_NAME, meetingUrl: MEETING_URL, sessionUrl: SESSION_URL }));
  });
} catch (wsErr) {
  console.log('[VACFA Relay] Notice: Running in HTTP SSE mode.');
}

// Periodic heartbeat every 15s to keep connections alive
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':heartbeat\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

function broadcastToClients(data) {
  const rawJson = JSON.stringify(data);

  // Send to all connected WebSocket clients (GitHub Pages / web app)
  if (wss) {
    for (const client of wss.clients) {
      if (client.readyState === 1 /* OPEN */) {
        try {
          client.send(rawJson);
        } catch {}
      }
    }
  }

  // Send to all connected Server-Sent Events clients
  const ssePayload = `data: ${rawJson}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(ssePayload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ============================================================================
// 2. Gemini Real-Time Translation & Fallback Engine
// ============================================================================
const MEDICAL_GLOSSARY_PROMPT = `
You are VACFA Translate, an expert real-time conference interpreter for African public health summits.
1. The speaker may speak English, French, Portuguese, or Swahili.
2. Accurately translate their speech into English (en), French (fr), Portuguese (pt), and Swahili (sw).
3. Strictly preserve and enforce these approved VACFA medical terms:
   - NITAG (National Immunization Technical Advisory Group) -> FR: NITAG, PT: NITAG, SW: NITAG
   - NISH (Vaccine Innovation and Strengthening Hub) -> FR: NISH, PT: NISH, SW: NISH
   - RITAG (Regional Immunization Technical Advisory Group) -> FR: RITAG, PT: RITAG, SW: RITAG
   - AEFI (Adverse Events Following Immunization) -> FR: MAPI, PT: EAPV, SW: AEFI
   - EPI (Expanded Programme on Immunization) -> FR: PEV, PT: PAV, SW: EPI
   - VVM (Vaccine Vial Monitor) -> FR: PCV, PT: MVV, SW: VVM
   - Gavi (Gavi, the Vaccine Alliance) -> FR: Gavi, PT: Gavi, SW: Gavi
   - mRNA -> FR: ARNm, PT: mRNA, SW: mRNA
   - Zero-dose child -> FR: enfant zéro-dose, PT: criança dose-zero, SW: mtoto asiyechanjwa kabisa
   - Cold chain -> FR: chaîne du froid, PT: cadeia de frio, SW: mfumo wa baridi

Output ONLY valid JSON matching this schema:
{
  "detectedLanguage": "en|fr|pt|sw",
  "translations": {
    "en": "...",
    "fr": "...",
    "pt": "...",
    "sw": "..."
  },
  "detectedGlossaryTerms": ["..."]
}
`;

async function translateUtterance(text, speaker = 'Participant') {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const candidateModels = [
    process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-pro-latest',
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  if (apiKey) {
    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Speaker "${speaker}": "${text}"` }] }],
            systemInstruction: { parts: [{ text: MEDICAL_GLOSSARY_PROMPT }] },
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) continue;
        const data = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) continue;
        const parsed = JSON.parse(raw);

        return {
          sourceLang: parsed.detectedLanguage || 'en',
          translations: parsed.translations || { en: text, fr: text, pt: text, sw: text },
          glossaryTerms: parsed.detectedGlossaryTerms || [],
          provider: `Gemini (${model})`,
        };
      } catch {
        // Try next candidate model
      }
    }
  }

  // Fallback to MyMemory Public API
  return fallbackTranslate(text);
}

async function fallbackTranslate(text) {
  const translations = { en: text, fr: text, pt: text, sw: text };
  try {
    const targets = ['fr', 'pt', 'sw'];
    await Promise.all(
      targets.map(async (tgt) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${tgt}&de=vacfa@uct.ac.za`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            const translated = data?.responseData?.translatedText;
            if (translated && !translated.includes('MYMEMORY')) {
              translations[tgt] = translated;
            }
          }
        } catch {}
      })
    );
  } catch {}

  return {
    sourceLang: 'en',
    translations,
    glossaryTerms: [],
    provider: 'Smart Fallback (Public Engine)',
  };
}

// ============================================================================
// 3. Microsoft Teams CART Caption Dispatcher
// ============================================================================
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

// ============================================================================
// 4. Browser Discovery
// ============================================================================
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

// ============================================================================
// 5. Teams Web Client Script: Auto-Join, Live Captions, and Speech Harvester
// ============================================================================
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
  let joinAttempts = 0;
  const preJoinInterval = setInterval(() => {
    handlePreJoin();
    joinAttempts++;
    
    // Detect if inside meeting room
    const inMeeting = document.querySelector('div[data-tid="calling-active-speaker"], div[data-tid="participant-stream"], div[data-tid="calling-roster-section"], div[data-tid="calling-more-actions"], button[data-tid="calling-more-actions"]');
    if (inMeeting) {
      clearInterval(preJoinInterval);
      console.log('[VACFA Bot] Connected inside Teams meeting call!');
      startCaptionsSystem();
      startActiveSpeakerMonitor();
      initChatAnnouncementLoop();
    }
  }, 1000);

  // Step 2: Auto-Enable Teams Live Captions and Harvest All Speakers
  function startCaptionsSystem() {
    console.log('[VACFA Bot] Initializing Teams Cloud Live Captions Harvester...');

    // Attempt to toggle live captions ON in Teams
    function turnOnCaptions() {
      // Check if captions container already exists
      const captionsRenderer = document.querySelector('div[data-tid="closed-captions-renderer"], div[class*="closed-captions"], div[class*="closedCaptions"]');
      if (captionsRenderer) {
        console.log('[VACFA Bot] Teams Live Captions already active in meeting.');
        return;
      }

      // Try keyboard shortcut Ctrl+Shift+C on document
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'C',
        code: 'KeyC',
        keyCode: 67,
        which: 67,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }));

      // Try clicking "More actions" (...) -> "Turn on live captions"
      const moreBtn = document.querySelector('button[data-tid="calling-more-actions"], button#callingButtons-showMoreBtn, button[aria-label*="More" i]');
      if (moreBtn) {
        moreBtn.click();
        setTimeout(() => {
          const captionMenuBtn = Array.from(document.querySelectorAll('button, div, li')).find(el =>
            /turn on live captions/i.test(el.textContent || '') ||
            el.getAttribute('data-tid') === 'captions-menu-item' ||
            /live captions/i.test(el.getAttribute('aria-label') || '')
          );
          if (captionMenuBtn) {
            console.log('[VACFA Bot] Clicking "Turn on live captions" in Teams menu...');
            captionMenuBtn.click();
          } else {
            // Close menu if not found
            document.body.click();
          }
        }, 500);
      }
    }

    turnOnCaptions();
    // Re-check after 8 seconds in case meeting was still spinning up
    setTimeout(turnOnCaptions, 8000);

    // Harvest captions across all attendees
    let lastFlushedText = '';
    let lastFlushedSpeaker = '';
    let activeSentence = '';
    let activeSpeaker = '';
    let flushTimer = null;

    function flushUtterance() {
      const clean = activeSentence.trim();
      const speaker = activeSpeaker.trim() || 'Speaker';
      activeSentence = '';
      activeSpeaker = '';

      if (!clean || clean.length < 3) return;
      if (speaker === "${BOT_NAME}") return; // Skip bot's own captions
      if (clean === lastFlushedText && speaker === lastFlushedSpeaker) return;

      lastFlushedText = clean;
      lastFlushedSpeaker = speaker;

      console.log('[VACFA_HEARD_SPEECH]', JSON.stringify({
        speaker: speaker,
        text: clean,
        timestamp: Date.now(),
      }));
    }

    function processCaptionNode(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

      // Extract speaker name
      const speakerEl = node.querySelector(
        '[data-tid="closed-caption-speaker"], [class*="speaker"], [class*="author"], strong, [data-tid="author"]'
      );
      // Extract caption text
      const textEl = node.querySelector(
        '[data-tid="closed-caption-text"], [class*="caption-text"], [class*="message"], [class*="text"]'
      );

      let text = (textEl ? textEl.textContent : node.textContent || '').trim();
      let speaker = (speakerEl ? speakerEl.textContent : '').replace(/[:：]$/, '').trim();

      // If text contains "Speaker: Message" pattern
      if (!speaker && text.includes(':')) {
        const parts = text.split(':');
        speaker = parts[0].trim();
        text = parts.slice(1).join(':').trim();
      }

      if (!text) return;
      if (speaker === "${BOT_NAME}") return;

      if (!speaker && window.__VACFA_CURRENT_SPEAKER__) {
        speaker = window.__VACFA_CURRENT_SPEAKER__;
      }

      activeSpeaker = speaker || 'Meeting Speaker';
      activeSentence = text;

      if (flushTimer) clearTimeout(flushTimer);
      // Buffer by 750ms: when the speaker pauses, finalize sentence
      flushTimer = setTimeout(flushUtterance, 750);
    }

    // Observe document for closed captions
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (addedNode.nodeType === Node.ELEMENT_NODE) {
            const el = addedNode;
            // Check if this element or its container is a caption item
            if (
              el.matches && (
                el.matches('[data-tid*="caption"], [class*="caption"], [role="log"] *, [aria-live="polite"] *') ||
                el.querySelector('[data-tid*="caption"], [class*="caption"]')
              )
            ) {
              processCaptionNode(el);
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Fallback polling: scan existing caption containers every 600ms
    setInterval(() => {
      const captionItems = document.querySelectorAll(
        '[data-tid="closed-caption-item"], div[class*="caption-item"], [data-tid="closed-captions-renderer"] > div, div[class*="closed-caption"]'
      );
      if (captionItems.length > 0) {
        const latest = captionItems[captionItems.length - 1];
        processCaptionNode(latest);
      }
    }, 600);
  }

  // Step 3: Active speaker video tile monitor (tracks speaker names from video streams)
  function startActiveSpeakerMonitor() {
    setInterval(() => {
      const activeSpeakerEl = document.querySelector(
        '[data-tid="calling-active-speaker"] [data-tid="participant-name"], ' +
        '[data-tid="participant-stream"][aria-label*="speaking" i], ' +
        'div[aria-label*="is speaking" i]'
      );

      if (activeSpeakerEl) {
        const speakerName = (activeSpeakerEl.textContent || activeSpeakerEl.getAttribute('aria-label') || '')
          .replace(/is speaking/gi, '')
          .trim();

        if (speakerName && speakerName !== "${BOT_NAME}") {
          window.__VACFA_CURRENT_SPEAKER__ = speakerName;
        }
      }
    }, 500);
  }

  // Step 4: Post Welcome & Translation URLs into Teams Meeting Chat (with retry loop)
  function initChatAnnouncementLoop() {
    let announcementAttempts = 0;
    const chatInterval = setInterval(() => {
      if (window.__VACFA_CHAT_ANNOUNCED__ || announcementAttempts > 15) {
        clearInterval(chatInterval);
        return;
      }
      announcementAttempts++;

      const chatBtn = document.querySelector(
        'button[data-tid="chat-button"], button#chat-button, button[aria-label*="chat" i], button[aria-label*="conversation" i]'
      );

      if (chatBtn) {
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
          }
        }, 1500);
      }
    }, 3000);
  }
})();
`;

// ============================================================================
// 6. Main Orchestrator & Chrome DevTools Protocol Bridge
// ============================================================================
async function main() {
  const browserBin = findBrowser();
  if (!browserBin) {
    console.error('[VACFA Bot] Error: Neither Google Chrome nor Microsoft Edge was found on this system.');
    process.exit(1);
  }

  const browserName = browserBin.toLowerCase().includes('edge') ? 'Microsoft Edge' : 'Google Chrome';
  console.log(`[VACFA Bot] Detected browser engine: ${browserName}`);
  console.log(`[VACFA Bot] Binary path: ${browserBin}`);

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
    '--remote-allow-origins=*',
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

  // Verify CART connectivity if URL provided
  if (CART_URL) {
    setTimeout(async () => {
      console.log('[VACFA Bot] Checking Teams CART caption status...');
      const ok = await sendCartCaption(CART_URL, 'VACFA AI Interpreter connected to Teams captions banner.');
      if (ok) {
        console.log('[VACFA Bot] CART Endpoint: ACTIVE (Captions successfully delivering into Teams)');
      } else {
        console.log('[VACFA Bot] Note: CART endpoint waiting for meeting to start or organizer approval.');
      }
    }, 3000);
  }

  // Connect to Chrome DevTools Protocol
  async function attachCDP() {
    let attempts = 0;
    const WebSocketClient = require('ws');

    while (true) {
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

          const ws = new WebSocketClient(teamsPage.webSocketDebuggerUrl);

          ws.on('open', () => {
            console.log('[VACFA Bot] CDP WebSocket stream established.');

            // Enable Runtime, Page, and Input
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
            ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));

            // Trigger Ctrl+Shift+C via CDP hardware key event to ensure Live Captions are toggled
            setTimeout(() => {
              console.log('[VACFA Bot] Dispatching Ctrl+Shift+C hotkey to activate Teams Live Captions...');
              ws.send(JSON.stringify({
                id: 101,
                method: 'Input.dispatchKeyEvent',
                params: {
                  type: 'rawKeyDown',
                  windowsVirtualKeyCode: 67,
                  modifiers: 10,
                  code: 'KeyC',
                  key: 'C',
                },
              }));
              ws.send(JSON.stringify({
                id: 102,
                method: 'Input.dispatchKeyEvent',
                params: {
                  type: 'keyUp',
                  windowsVirtualKeyCode: 67,
                  modifiers: 10,
                  code: 'KeyC',
                  key: 'C',
                },
              }));
            }, 8000);

            // Periodically ensure in-meeting controller script is active
            const injectInterval = setInterval(() => {
              ws.send(JSON.stringify({
                id: 3,
                method: 'Runtime.evaluate',
                params: {
                  expression: IN_MEETING_CONTROLLER_SCRIPT,
                  returnByValue: false,
                },
              }));
            }, 2500);

              // Listen for console events from Teams client
              ws.on('message', async (msg) => {
                try {
                  const ev = JSON.parse(msg.toString());
                  if (ev.method === 'Runtime.consoleAPICalled') {
                    const text = ev.params.args.map((a) => a.value || a.description || '').join(' ');

                    if (text.includes('[VACFA_HEARD_SPEECH]')) {
                      const jsonPart = text.replace(/.*\[VACFA_HEARD_SPEECH\]\s*/, '').trim();
                      try {
                        const payload = JSON.parse(jsonPart);
                        const { speaker, text: spokenText } = payload;

                        console.log(`\n🎙️  [Teams Speaker: ${speaker}]: "${spokenText}"`);

                        // 1. Instant sub-second translation via Gemini 3.8 Flash
                        const translationResult = await translateUtterance(spokenText, speaker);

                        console.log(`🌍  [Gemini AI (${translationResult.provider})]:`);
                        console.log(`    🇫🇷 FR: "${translationResult.translations.fr}"`);
                        console.log(`    🇵🇹 PT: "${translationResult.translations.pt}"`);
                        console.log(`    🇹🇿 SW: "${translationResult.translations.sw}"`);

                        const captionEntry = {
                          id: `teams-bot-${Date.now()}`,
                          speaker: `${speaker} (${translationResult.sourceLang.toUpperCase()})`,
                          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                          originalText: spokenText,
                          translations: translationResult.translations,
                          glossaryTerms: translationResult.glossaryTerms,
                        };

                        // 2. Broadcast to VACFA Live Session App (GitHub Pages / local) via SSE
                        broadcastToClients({ type: 'caption', caption: captionEntry });

                        // 3. Deliver to Microsoft Teams CART Captions if configured
                        if (CART_URL) {
                          const cartLang = process.env.CART_LANGUAGE || 'fr';
                          const cartSub = translationResult.translations[cartLang] || spokenText;
                          await sendCartCaption(CART_URL, cartSub, `${speaker} (${cartLang.toUpperCase()})`);
                        }
                      } catch (parseErr) {
                        console.error('[VACFA Bot] Error parsing speech JSON:', parseErr.message);
                      }
                    } else if (text.includes('[VACFA')) {
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
        } catch (err) {
          // Retrying connection
        }
      }

      console.log('[VACFA Bot] Browser running. Teams window open on screen.');
    }

  attachCDP();

  console.log(`\n=============================================================================`);
  console.log(`  VACFA Bot Status: RUNNING & LISTENING`);
  console.log(`  1. The browser window has opened to your Teams meeting.`);
  console.log(`  2. Display name will be pre-filled as "${BOT_NAME}".`);
  console.log(`  3. In Teams, click Admit if the bot appears in the lobby.`);
  console.log(`  4. Live Audio & Subtitles Relay Bridge:`);
  console.log(`     http://127.0.0.1:${RELAY_PORT}/events`);
  console.log(`  5. Live Session Web App for Attendees:`);
  console.log(`     ${SESSION_URL}`);
  console.log(`  Press Ctrl+C in this terminal to stop the bot.`);
  console.log(`=============================================================================\n`);
}

main().catch(console.error);
