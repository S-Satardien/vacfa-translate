/**
 * VACFA Translate — Microsoft Teams Bot Runner v2
 *
 * Architecture: WebRTC Audio Intercept + Gemini Multimodal STT + Translation
 *
 * Key changes from v1:
 *  1. Uses CDP Page.setBypassCSP to eliminate Teams' Trusted Types / CSP blocks
 *     that were killing WASM audio workers.
 *  2. Monkey-patches RTCPeerConnection via Page.addScriptToEvaluateOnNewDocument
 *     so the interceptor is in place BEFORE Teams JS loads.
 *  3. Captures mixed remote audio (all participants) via MediaRecorder → WebM/Opus.
 *  4. Sends audio chunks to Gemini multimodal API for combined STT + translation.
 *  5. Uses Runtime.addBinding for reliable browser→Node IPC (no console.log parsing).
 *  6. Keeps an enhanced DOM caption observer as a fallback path.
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

// ============================================================================
// 0. Environment
// ============================================================================
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?$/);
        if (m) {
          const key = m[1];
          const val = (m[2] || '').replace(/^['"]|['"]$/g, '').trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    } catch { /* ignore */ }
  }
}
loadEnvLocal();

// ============================================================================
// 1. Configuration
// ============================================================================
const DEFAULT_MEETING_URL =
  'https://teams.microsoft.com/meet/35898491838902?p=t69Kw3xIC3m9il84Z2';
const DEFAULT_CART_URL = '';

const MEETING_URL  = process.argv[2] || process.env.TEAMS_MEETING_URL || DEFAULT_MEETING_URL;
const CART_URL     = process.argv[3] || process.env.TEAMS_CART_URL    || DEFAULT_CART_URL;
const SESSION_URL  = process.argv[4] || process.env.SESSION_URL       || 'https://s-satardien.github.io/vacfa-translate/live/session-008';
const JOIN_CODE    = process.argv[5] || process.env.JOIN_CODE         || '736532';
const BOT_NAME     = process.env.BOT_NAME  || 'VACFA AI Interpreter';
const BOT_EMAIL    = process.env.BOT_EMAIL || 'bot@vacfa-translate.org';
const DEBUG_PORT   = process.env.DEBUG_PORT || 9222;
const RELAY_PORT   = 9876;

const CHAT_ANNOUNCEMENT =
  `🌐 VACFA AI Live Interpretation is active! 🎧 Listen: ${SESSION_URL} (code ${JOIN_CODE})`;

console.log('='.repeat(77));
console.log('  VACFA Translate — Virtual Attendee Bot  v2 (Audio Capture)');
console.log('='.repeat(77));
console.log(`[Bot] Meeting : ${MEETING_URL}`);
console.log(`[Bot] Identity: ${BOT_NAME}`);
console.log(`[Bot] Listener: ${SESSION_URL} (Code: ${JOIN_CODE})`);
console.log('-'.repeat(77));

// ============================================================================
// 2. Local Relay Server (WebSocket + SSE → VACFA Live Session App)
// ============================================================================
const sseClients = new Set();
let wss = null;

const relayServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'bot_status', connected: true, botName: BOT_NAME })}\n\n`);
    sseClients.add(res);
    console.log(`[Relay] SSE client connected (total: ${sseClients.size})`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running', botName: BOT_NAME, clients: sseClients.size }));
    return;
  }
  res.writeHead(404); res.end();
});

relayServer.listen(RELAY_PORT, '127.0.0.1', () => {
  console.log(`[Relay] ws://127.0.0.1:${RELAY_PORT}  |  http://127.0.0.1:${RELAY_PORT}/events`);
});

try {
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server: relayServer });
  wss.on('connection', (client) => {
    console.log(`[Relay] WebSocket client connected (total: ${wss.clients.size})`);
    client.send(JSON.stringify({ type: 'bot_status', connected: true, botName: BOT_NAME }));
  });
} catch { console.log('[Relay] ws package not found — SSE-only mode'); }

setInterval(() => {
  for (const c of sseClients) {
    try { c.write(':heartbeat\n\n'); } catch { sseClients.delete(c); }
  }
}, 15000);

/** Broadcast a JSON payload to every connected web-app client. */
function broadcastToClients(data) {
  const raw = JSON.stringify(data);
  if (wss) for (const c of wss.clients) {
    if (c.readyState === 1) try { c.send(raw); } catch { /* skip */ }
  }
  const sse = `data: ${raw}\n\n`;
  for (const c of sseClients) {
    try { c.write(sse); } catch { sseClients.delete(c); }
  }
}

// ============================================================================
// 3. Gemini — Audio Transcription + Translation (single API call)
// ============================================================================
const AUDIO_SYSTEM_PROMPT = `
You are VACFA Translate, an expert real-time interpreter for African public health conferences.

Listen to the audio. Perform ALL of these steps:
1. Transcribe the speech in its original language.
2. Detect the source language (en, fr, pt, or sw).
3. Translate into English (en), French (fr), Portuguese (pt), and Swahili (sw).
4. Flag any VACFA medical glossary terms found.

VACFA Glossary (always use these translations):
  NITAG → FR: NITAG, PT: NITAG, SW: NITAG
  AEFI  → FR: MAPI,  PT: EAPV,  SW: AEFI
  EPI   → FR: PEV,   PT: PAV,   SW: EPI
  VVM   → FR: PCV,   PT: MVV,   SW: VVM
  Gavi  → FR: Gavi,  PT: Gavi,  SW: Gavi
  mRNA  → FR: ARNm,  PT: mRNA,  SW: mRNA
  Zero-dose child → FR: enfant zéro-dose, PT: criança dose-zero, SW: mtoto asiyechanjwa kabisa
  Cold chain      → FR: chaîne du froid,  PT: cadeia de frio,    SW: mfumo wa baridi

If the audio contains NO intelligible speech, output: { "noSpeech": true }

Output ONLY valid JSON:
{
  "transcript": "exact words spoken",
  "detectedLanguage": "en",
  "speaker": "Unknown",
  "translations": { "en": "...", "fr": "...", "pt": "...", "sw": "..." },
  "detectedGlossaryTerms": []
}`;

let audioCallCount = 0;

/**
 * Sends a WebM audio chunk to Gemini for combined STT + translation.
 * @param {string} base64Audio - Base64-encoded audio/webm data
 * @returns {Promise<object|null>} Parsed result or null on failure
 */
async function transcribeAndTranslateAudio(base64Audio) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('[Gemini] No API key'); return null; }

  const candidateModels = [
    process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
              { text: 'Transcribe and translate this audio segment.' },
            ],
          }],
          systemInstruction: { parts: [{ text: AUDIO_SYSTEM_PROMPT }] },
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) { continue; }
      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (parsed.noSpeech) return null;

      audioCallCount++;
      parsed._model = model;
      return parsed;
    } catch { /* try next model */ }
  }
  return null;
}

// ============================================================================
// 4. Gemini — Text-Only Translation (fallback for caption scraping path)
// ============================================================================
const TEXT_TRANSLATION_PROMPT = `
You are VACFA Translate. Translate the given text into en, fr, pt, sw.
Use VACFA medical glossary terms where applicable.
Output ONLY valid JSON:
{ "detectedLanguage":"en", "translations":{"en":"...","fr":"...","pt":"...","sw":"..."}, "detectedGlossaryTerms":[] }`;

async function translateText(text, speaker = 'Participant') {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackTranslate(text);

  const candidateModels = [
    process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Speaker "${speaker}": "${text}"` }] }],
          systemInstruction: { parts: [{ text: TEXT_TRANSLATION_PROMPT }] },
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) continue;
      const p = JSON.parse(raw);
      return {
        sourceLang: p.detectedLanguage || 'en',
        translations: p.translations || { en: text, fr: text, pt: text, sw: text },
        glossaryTerms: p.detectedGlossaryTerms || [],
        provider: `Gemini (${model})`,
      };
    } catch { /* next */ }
  }
  return fallbackTranslate(text);
}

async function fallbackTranslate(text) {
  const translations = { en: text, fr: text, pt: text, sw: text };
  const targets = ['fr', 'pt', 'sw'];
  await Promise.allSettled(targets.map(async (tgt) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${tgt}&de=vacfa@uct.ac.za`,
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      if (res.ok) {
        const d = await res.json();
        const tr = d?.responseData?.translatedText;
        if (tr && !tr.includes('MYMEMORY')) translations[tgt] = tr;
      }
    } catch { /* skip */ }
  }));
  return { sourceLang: 'en', translations, glossaryTerms: [], provider: 'Fallback' };
}

// ============================================================================
// 5. Microsoft Teams CART Caption Dispatcher
// ============================================================================
function sendCartCaption(cartUrl, text, speakerName = BOT_NAME) {
  if (!cartUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const u = new URL(cartUrl);
      const client = u.protocol === 'https:' ? https : http;
      const payload = `${new Date().toISOString()} ${speakerName}: ${text}\r\n\r\n`;
      const req = client.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 4000,
      }, (r) => resolve(r.statusCode < 300));
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    } catch { resolve(false); }
  });
}

// ============================================================================
// 6. Browser Discovery
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
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const bin of candidates) if (fs.existsSync(bin)) return bin;
  return null;
}

// ============================================================================
// 7. CDP Injection Scripts (evaluated BEFORE Teams JS loads and continuously)
// ============================================================================

/**
 * Script A — WebRTC Audio Interceptor (Continuous Central Mixer)
 *
 * Maintains a persistent Web Audio destination & recorder loop.
 * Every incoming audio track from RTCPeerConnection and HTMLMediaElement.srcObject
 * is dynamically plugged into the mixer, so track renegotiations never interrupt capture.
 * Chunks (3.5s) are transmitted via Runtime.addBinding('vacfaAudioChunk').
 */
const AUDIO_INTERCEPTOR_SCRIPT = `
(function(){
  if(window.__VACFA_RTC_HOOKED__)return;
  window.__VACFA_RTC_HOOKED__=true;

  const LOG='[VACFA Audio]';
  const seenTracks=new Set();

  let audioCtx=null;
  let mixerDest=null;
  let analyser=null;
  let recorder=null;
  let currentSegmentChunks=[];
  let maxVolumeInSegment=0;

  function initMixer(){
    if(audioCtx)return;
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});
      audioCtx.resume().catch(()=>{});

      mixerDest=audioCtx.createMediaStreamDestination();
      analyser=audioCtx.createAnalyser();
      analyser.fftSize=1024;

      const buf=new Uint8Array(analyser.frequencyBinCount);
      setInterval(()=>{
        analyser.getByteTimeDomainData(buf);
        let peak=0;
        for(let i=0;i<buf.length;i++){
          const diff=Math.abs(buf[i]-128);
          if(diff>peak)peak=diff;
        }
        if(peak>maxVolumeInSegment)maxVolumeInSegment=peak;
      },60);

      startRecordingLoop();
      console.log(LOG,'Persistent audio mixer initialized.');
    }catch(e){console.error(LOG,'Init mixer failed',e);}
  }

  function startRecordingLoop(){
    if(!mixerDest||!mixerDest.stream)return;

    function runSlice(){
      maxVolumeInSegment=0;
      currentSegmentChunks=[];

      try{
        recorder=new MediaRecorder(mixerDest.stream,{mimeType:'audio/webm;codecs=opus'});
      }catch(err){
        console.error(LOG,'MediaRecorder creation failed, retrying in 2s',err);
        setTimeout(runSlice,2000);
        return;
      }

      recorder.ondataavailable=(e)=>{
        if(e.data&&e.data.size>0)currentSegmentChunks.push(e.data);
      };

      recorder.onstop=async()=>{
        const chunks=currentSegmentChunks;
        const volume=maxVolumeInSegment;

        setTimeout(runSlice,30);

        if(chunks.length>0&&volume>=2){
          try{
            const blob=new Blob(chunks,{type:'audio/webm'});
            if(blob.size>800){
              const buf=await blob.arrayBuffer();
              const bytes=new Uint8Array(buf);
              let binary='';
              const CHUNK=8192;
              for(let i=0;i<bytes.length;i+=CHUNK){
                binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));
              }
              const b64=btoa(binary);
              if(window.vacfaAudioChunk){
                console.log(LOG,'Transmitting audio chunk (vol: '+volume+', size: '+Math.round(blob.size/1024)+'KB)');
                window.vacfaAudioChunk(b64);
              }
            }
          }catch(encodeErr){console.error(LOG,'Encode error',encodeErr);}
        }
      };

      recorder.onerror=()=>{
        setTimeout(runSlice,1000);
      };

      recorder.start();
      setTimeout(()=>{
        if(recorder&&recorder.state==='recording'){
          try{recorder.stop();}catch(e){}
        }
      },3500);
    }

    runSlice();
  }

  function connectTrackToMixer(track,sourceLabel){
    if(!track||track.kind!=='audio')return;
    if(seenTracks.has(track.id))return;
    seenTracks.add(track.id);

    initMixer();
    if(!audioCtx)return;

    try{
      console.log(LOG,'Connecting remote audio track ('+sourceLabel+'):',track.id);
      const stream=new MediaStream([track]);
      const sourceNode=audioCtx.createMediaStreamSource(stream);

      sourceNode.connect(mixerDest);
      sourceNode.connect(analyser);
      sourceNode.connect(audioCtx.destination);

      track.addEventListener('ended',()=>{
        console.log(LOG,'Audio track ended:',track.id);
        try{sourceNode.disconnect();}catch(e){}
        seenTracks.delete(track.id);
      });
    }catch(e){console.warn(LOG,'Failed to connect track',track.id,e);}
  }

  /* ---- Hook RTCPeerConnection ---- */
  const OrigPC=window.RTCPeerConnection;
  if(OrigPC){
    window.RTCPeerConnection=function(...args){
      const pc=new OrigPC(...args);
      pc.addEventListener('track',(ev)=>{
        if(ev.track&&ev.track.kind==='audio'){
          connectTrackToMixer(ev.track,'RTCPeerConnection');
        }
      });
      return pc;
    };
    window.RTCPeerConnection.prototype=OrigPC.prototype;
    Object.setPrototypeOf(window.RTCPeerConnection,OrigPC);
  }

  /* ---- Hook HTMLMediaElement.srcObject ---- */
  try{
    const desc=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'srcObject');
    if(desc){
      Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{
        set(stream){
          if(stream instanceof MediaStream){
            for(const t of stream.getAudioTracks()){
              connectTrackToMixer(t,'HTMLMediaElement.srcObject');
            }
          }
          return desc.set.call(this,stream);
        },
        get(){return desc.get.call(this);}
      });
    }
  }catch(e){console.warn(LOG,'srcObject hook failed',e);}
})();
`;

/**
 * Script B — Pre-Join Automation
 *
 * Handles the Teams pre-join lobby: sets name, mutes mic/cam, clicks Join.
 */
const PRE_JOIN_SCRIPT = `
(function(){
  if(window.__VACFA_PREJOIN_ACTIVE__)return;
  window.__VACFA_PREJOIN_ACTIVE__=true;

  const BOT_NAME="${BOT_NAME}";
  const CHAT_MSG="${CHAT_ANNOUNCEMENT.replace(/"/g, '\\"')}";
  let joinedMeeting=false;

  function handlePreJoin(){
    /* "Continue on this browser" */
    const contBtn=Array.from(document.querySelectorAll('button,a')).find(el=>
      /continue on this browser/i.test(el.textContent||'')||el.getAttribute('data-tid')==='joinOnWeb'
    );
    if(contBtn){contBtn.click();return;}

    /* Name input */
    const nameIn=document.querySelector('input[data-tid="prejoin-display-name-input"],input[placeholder*="name" i],input[aria-label*="name" i]');
    if(nameIn&&nameIn.value!==BOT_NAME){
      nameIn.focus();
      nameIn.value=BOT_NAME;
      nameIn.dispatchEvent(new Event('input',{bubbles:true}));
      nameIn.dispatchEvent(new Event('change',{bubbles:true}));
    }

    /* Mute mic */
    const micBtn=document.querySelector('button[data-tid="toggle-mute"],button[aria-label*="microphone" i]');
    if(micBtn&&micBtn.getAttribute('aria-checked')==='true')micBtn.click();

    /* Turn off camera */
    const camBtn=document.querySelector('button[data-tid="toggle-video"],button[aria-label*="camera" i]');
    if(camBtn&&camBtn.getAttribute('aria-checked')==='true')camBtn.click();

    /* Click "Join now" */
    const joinBtn=document.querySelector('button[data-tid="prejoin-join-button"],button#prejoin-join-button');
    if(joinBtn&&!joinBtn.disabled){joinBtn.click();}
  }

  /* Detect meeting joined */
  function checkInMeeting(){
    return !!document.querySelector(
      'div[data-tid="calling-active-speaker"],div[data-tid="participant-stream"],' +
      'button[data-tid="calling-more-actions"],div[data-tid="calling-roster-section"]'
    );
  }

  const iv=setInterval(()=>{
    if(!joinedMeeting){
      handlePreJoin();
      if(checkInMeeting()){
        joinedMeeting=true;
        console.log('[VACFA Bot] Inside meeting — audio mixer active');
        enableCaptions();
        setTimeout(postChatAnnouncement,6000);
      }
    }
  },1200);

  /* Enable live captions via Ctrl+Shift+C */
  function enableCaptions(){
    document.dispatchEvent(new KeyboardEvent('keydown',{
      key:'C',code:'KeyC',keyCode:67,which:67,ctrlKey:true,shiftKey:true,bubbles:true
    }));
    setTimeout(()=>{
      const more=document.querySelector('button[data-tid="calling-more-actions"],button[aria-label*="More" i]');
      if(more){
        more.click();
        setTimeout(()=>{
          const capBtn=Array.from(document.querySelectorAll('button,div,li,span')).find(el=>
            /turn on live captions|enable.*captions/i.test(el.textContent||'')||
            el.getAttribute('data-tid')==='captions-menu-item'
          );
          if(capBtn)capBtn.click(); else document.body.click();
        },600);
      }
    },3000);
  }

  /* Post translation link in Teams chat */
  function postChatAnnouncement(){
    if(window.__VACFA_CHAT_SENT__)return;
    const chatBtn=document.querySelector('button[data-tid="chat-button"],button[aria-label*="chat" i]');
    if(!chatBtn)return;
    const pane=document.querySelector('div[data-tid="chat-pane"]');
    if(!pane)chatBtn.click();
    setTimeout(()=>{
      const input=document.querySelector('div[contenteditable="true"][role="textbox"],div[aria-label*="Type a message" i]');
      if(input&&!window.__VACFA_CHAT_SENT__){
        window.__VACFA_CHAT_SENT__=true;
        input.focus();
        try{document.execCommand('insertText',false,CHAT_MSG);}catch{input.innerText=CHAT_MSG;}
        input.dispatchEvent(new Event('input',{bubbles:true}));
        setTimeout(()=>{
          const send=document.querySelector('button[data-tid="send-message-button"],button[aria-label*="Send" i]');
          if(send&&!send.disabled)send.click();
          else input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));
        },800);
      }
    },1500);
  }
})();
`;

/**
 * Script C — Enhanced Caption Observer (fallback if RTC audio capture fails)
 *
 * Watches for Teams Live Captions DOM nodes across main document AND iframes.
 * Ignores accessibility notifications (e.g. "Microphone is off", "joined the call").
 * Uses Runtime.addBinding('vacfaSpeechData') for reliable IPC.
 */
const CAPTION_OBSERVER_SCRIPT = `
(function(){
  if(window.__VACFA_CAPTION_OBS__)return;
  window.__VACFA_CAPTION_OBS__=true;

  const LOG='[VACFA Captions]';
  let lastText='';
  let lastTime=0;

  const SYSTEM_IGNORE_PATTERNS=[
    /microphone is (off|on|muted)/i,
    /camera is (off|on)/i,
    /joined the call/i,
    /left the call/i,
    /waiting in the lobby/i,
    /people in the meeting know you/i,
    /you are muted/i,
    /ctrl\\+shift\\+m/i,
    /press .* to speak/i,
  ];

  function sendCaption(speaker,text){
    const now=Date.now();
    const clean=text.trim();
    if(!clean||clean.length<3)return;
    if(SYSTEM_IGNORE_PATTERNS.some(p=>p.test(clean)))return;
    if(clean===lastText&&now-lastTime<4000)return;
    lastText=clean; lastTime=now;
    if(window.vacfaSpeechData){
      window.vacfaSpeechData(JSON.stringify({speaker:speaker||'Speaker',text:clean,ts:now}));
    }
  }

  const CAPTION_SELECTORS=[
    '[data-tid*="caption"]',
    '[class*="caption"]',
    '[class*="Caption"]',
    '[class*="closedCaption"]',
    '[class*="closed-caption"]',
    '[role="log"]',
    '[aria-live="polite"]',
    '[aria-live="assertive"]',
  ].join(',');

  function extractCaptionText(node){
    if(!node||node.nodeType!==1)return null;
    const speakerEl=node.querySelector('[data-tid*="speaker"],[class*="speaker"],[class*="author"],strong');
    const textEl=node.querySelector('[data-tid*="text"],[class*="text"],[class*="message"]');
    let text=(textEl?textEl.textContent:node.textContent||'').trim();
    let speaker=(speakerEl?speakerEl.textContent:'').replace(/[:：]$/,'').trim();
    if(!speaker&&text.includes(':')){
      const p=text.indexOf(':');
      speaker=text.slice(0,p).trim();
      text=text.slice(p+1).trim();
    }
    if(!text||text.length<2)return null;
    return{speaker,text};
  }

  function observeDoc(doc,label){
    try{
      const obs=new MutationObserver((muts)=>{
        for(const m of muts){
          for(const n of m.addedNodes){
            if(n.nodeType!==1)continue;
            if(n.matches&&n.matches(CAPTION_SELECTORS)){
              const r=extractCaptionText(n);
              if(r)sendCaption(r.speaker,r.text);
            }
            try{
              const kids=n.querySelectorAll(CAPTION_SELECTORS);
              for(const k of kids){
                const r=extractCaptionText(k);
                if(r)sendCaption(r.speaker,r.text);
              }
            }catch{}
          }
          if(m.type==='characterData'&&m.target.parentElement){
            const parent=m.target.parentElement.closest(CAPTION_SELECTORS);
            if(parent){
              const r=extractCaptionText(parent);
              if(r)sendCaption(r.speaker,r.text);
            }
          }
        }
      });

      const target=doc.body||doc.documentElement;
      if(target){
        obs.observe(target,{childList:true,subtree:true,characterData:true});
      }
    }catch(e){}
  }

  function init(){
    observeDoc(document,'main document');

    function scanIframes(){
      try{
        const frames=document.querySelectorAll('iframe');
        for(const f of frames){
          try{
            if(f.contentDocument&&!f.__VACFA_OBS__){
              f.__VACFA_OBS__=true;
              observeDoc(f.contentDocument,'iframe:'+f.src);
            }
          }catch{}
        }
      }catch{}
    }
    scanIframes();
    setInterval(scanIframes,3000);

    setInterval(()=>{
      try{
        const nodes=document.querySelectorAll(CAPTION_SELECTORS);
        if(nodes.length>0){
          const last=nodes[nodes.length-1];
          const r=extractCaptionText(last);
          if(r)sendCaption(r.speaker,r.text);
        }
      }catch{}
    },800);
  }

  if(document.body)init();
  else document.addEventListener('DOMContentLoaded',init);
})();
`;

// ============================================================================
// 8. Main Orchestrator
// ============================================================================
async function main() {
  const browserBin = findBrowser();
  if (!browserBin) {
    console.error('[Bot] No Chrome or Edge found on this system.');
    process.exit(1);
  }

  const browserName = browserBin.toLowerCase().includes('edge') ? 'Edge' : 'Chrome';
  console.log(`[Bot] Using ${browserName}: ${browserBin}`);

  const profileDir = path.join(os.homedir(), '.gemini', 'antigravity', 'teams-bot-profile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  // Clean up any stale process occupying port DEBUG_PORT
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const netstat = execSync(`netstat -ano | findstr :${DEBUG_PORT} | findstr LISTENING`, { encoding: 'utf8' });
      for (const line of netstat.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== process.pid.toString()) {
          console.log(`[Bot] Releasing stale debug port ${DEBUG_PORT} (PID ${pid})...`);
          try { execSync(`taskkill /F /PID ${pid}`); } catch {}
        }
      }
    }
  } catch {}

  // Launch Chrome directly with the target MEETING_URL
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

  console.log('[Bot] Launching browser directly to meeting URL...');
  const browserProcess = spawn(browserBin, browserArgs, { detached: false, stdio: 'ignore' });

  browserProcess.on('error', (e) => console.error('[Bot] Browser spawn error:', e.message));
  browserProcess.on('exit', (code) => {
    // Note: on Windows, chrome.exe launcher stub can exit with code 0 while the browser runs.
    // Only terminate runner if code != 0.
    if (code !== 0 && code !== null) {
      console.log(`[Bot] Browser process closed (code ${code}).`);
      process.exit(code);
    }
  });

  // ---- CDP Connection Loop ----
  const WebSocketClient = require('ws');

  function cdpFetch(urlPath) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${DEBUG_PORT}${urlPath}`, (res) => {
        let d = '';
        res.on('data', (c) => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
      }).on('error', reject);
    });
  }

  // Poll for CDP endpoint
  let wsUrl = null;
  for (let attempt = 1; attempt <= 45; attempt++) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const pages = await cdpFetch('/json');
      const page = pages.find((p) => p.type === 'page' && (p.url.includes('teams') || p.url.includes('microsoft') || p.url === MEETING_URL || p.url.startsWith('http')));
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
      // Fallback to first page if specific match not found yet
      if (!wsUrl && pages[0]?.webSocketDebuggerUrl) {
        wsUrl = pages[0].webSocketDebuggerUrl;
        break;
      }
    } catch { /* wait for Chrome */ }
    if (attempt % 5 === 0) console.log(`[Bot] Connecting to Chrome CDP bridge (attempt ${attempt}/45)...`);
  }

  if (!wsUrl) {
    console.error('[Bot] Failed to connect to browser CDP port. Please check that Chrome is installed.');
    return;
  }

  console.log('[Bot] CDP available — setting up real-time audio pipeline...');

  const ws = new WebSocketClient(wsUrl);
  let cmdId = 0;
  const pending = new Map();

  function cdpSend(method, params = {}) {
    const id = ++cmdId;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  let lastBroadcastText = '';
  let lastBroadcastTime = 0;
  let processingAudio = false;

  ws.on('open', async () => {
    console.log('[Bot] CDP WebSocket connection established.');

    // 1. Enable CDP domains
    await cdpSend('Page.enable');
    await cdpSend('Runtime.enable');

    // 2. Bypass Content Security Policy (fixes WASM calling workers & Trusted Types)
    await cdpSend('Page.setBypassCSP', { enabled: true });
    console.log('[Bot] ✅ Page.setBypassCSP enabled — Trusted Types & WASM restrictions cleared');

    // 3. Register IPC bindings (Browser -> Node.js)
    await cdpSend('Runtime.addBinding', { name: 'vacfaAudioChunk' });
    await cdpSend('Runtime.addBinding', { name: 'vacfaSpeechData' });
    console.log('[Bot] ✅ Runtime bindings active (vacfaAudioChunk, vacfaSpeechData)');

    // 4. Inject scripts for all subsequent page navigations
    await cdpSend('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_INTERCEPTOR_SCRIPT });
    await cdpSend('Page.addScriptToEvaluateOnNewDocument', { source: PRE_JOIN_SCRIPT });
    await cdpSend('Page.addScriptToEvaluateOnNewDocument', { source: CAPTION_OBSERVER_SCRIPT });
    console.log('[Bot] ✅ Pre-load interceptors armed for page loads');

    // 5. Evaluate immediately on the currently loaded page
    await cdpSend('Runtime.evaluate', { expression: AUDIO_INTERCEPTOR_SCRIPT });
    await cdpSend('Runtime.evaluate', { expression: PRE_JOIN_SCRIPT });
    await cdpSend('Runtime.evaluate', { expression: CAPTION_OBSERVER_SCRIPT });
    console.log('[Bot] ✅ Interceptors activated on current Teams tab');

    // 6. Keep active monitor alive to handle dynamically added elements / iframes
    setInterval(() => {
      cdpSend('Runtime.evaluate', { expression: PRE_JOIN_SCRIPT }).catch(() => {});
      cdpSend('Runtime.evaluate', { expression: CAPTION_OBSERVER_SCRIPT }).catch(() => {});
    }, 2500);

    // 7. Dispatch Ctrl+Shift+C key combination via CDP hardware input
    setTimeout(async () => {
      try {
        await cdpSend('Input.dispatchKeyEvent', {
          type: 'rawKeyDown',
          windowsVirtualKeyCode: 67,
          modifiers: 10,
          code: 'KeyC',
          key: 'C',
        });
        await cdpSend('Input.dispatchKeyEvent', {
          type: 'keyUp',
          windowsVirtualKeyCode: 67,
          modifiers: 10,
          code: 'KeyC',
          key: 'C',
        });
        console.log('[Bot] Dispatched Ctrl+Shift+C hardware hotkey for Teams Live Captions');
      } catch {}
    }, 12000);

    // 8. Verify CART caption endpoint if configured
    if (CART_URL) {
      setTimeout(async () => {
        const ok = await sendCartCaption(CART_URL, 'VACFA AI Interpreter online.');
        console.log(`[Bot] CART Ingestion Endpoint: ${ok ? 'ACTIVE' : 'Waiting for meeting'}`);
      }, 5000);
    }
  });

  // ---- Handle CDP messages ----
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Resolve pending command promises
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }

    // ---- AUDIO CHUNK received from browser ----
    if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === 'vacfaAudioChunk') {
      const b64 = msg.params.payload;
      if (!b64 || b64.length < 100) return; // Too small, skip

      // Rate-limit: only process one chunk at a time
      if (processingAudio) {
        return;
      }
      processingAudio = true;

      try {
        const sizeKB = Math.round(b64.length * 0.75 / 1024);
        console.log(`\n🎤 [Audio] Received ${sizeKB}KB chunk — sending to Gemini for STT+translation...`);

        const result = await transcribeAndTranslateAudio(b64);

        if (result && result.transcript) {
          // Dedup check
          const now = Date.now();
          if (result.transcript === lastBroadcastText && now - lastBroadcastTime < 5000) {
            processingAudio = false;
            return;
          }
          lastBroadcastText = result.transcript;
          lastBroadcastTime = now;

          const speaker = result.speaker || 'Meeting Speaker';
          console.log(`🎙️  [${speaker}]: "${result.transcript}"`);
          console.log(`🌍  Translations (${result._model}):`);
          console.log(`    🇫🇷 FR: "${result.translations?.fr}"`);
          console.log(`    🇵🇹 PT: "${result.translations?.pt}"`);
          console.log(`    🇹🇿 SW: "${result.translations?.sw}"`);

          const entry = {
            id: `bot-audio-${Date.now()}`,
            speaker: `${speaker} (${(result.detectedLanguage || 'en').toUpperCase()})`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            originalText: result.transcript,
            translations: result.translations || {},
            glossaryTerms: result.detectedGlossaryTerms || [],
          };

          broadcastToClients({ type: 'caption', caption: entry });

          if (CART_URL) {
            const cartLang = process.env.CART_LANGUAGE || 'fr';
            const cartText = result.translations?.[cartLang] || result.transcript;
            sendCartCaption(CART_URL, cartText, speaker).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[Bot] Audio processing error:', err.message);
      }
      processingAudio = false;
    }

    // ---- CAPTION TEXT received from DOM observer (fallback) ----
    if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === 'vacfaSpeechData') {
      try {
        const data = JSON.parse(msg.params.payload);
        const { speaker, text } = data;
        if (!text || text.length < 3) return;

        // Dedup
        const now = Date.now();
        if (text === lastBroadcastText && now - lastBroadcastTime < 4000) return;
        lastBroadcastText = text;
        lastBroadcastTime = now;

        console.log(`\n📝 [Captions Fallback] ${speaker}: "${text}"`);
        const tr = await translateText(text, speaker);

        const entry = {
          id: `bot-cap-${Date.now()}`,
          speaker: `${speaker} (${tr.sourceLang.toUpperCase()})`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          originalText: text,
          translations: tr.translations,
          glossaryTerms: tr.glossaryTerms,
        };

        broadcastToClients({ type: 'caption', caption: entry });

        if (CART_URL) {
          const cartLang = process.env.CART_LANGUAGE || 'fr';
          sendCartCaption(CART_URL, tr.translations[cartLang] || text, speaker).catch(() => {});
        }
      } catch (e) {
        console.error('[Bot] Caption parse error:', e.message);
      }
    }

    // ---- Console API (informational logging from injected scripts) ----
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params?.args?.map((a) => a.value || a.description || '').join(' ');
      if (text.includes('[VACFA')) console.log(text);
    }
  });

  ws.on('close', () => { console.log('[Bot] CDP connection closed'); });
  ws.on('error', (e) => { console.error('[Bot] CDP error:', e.message); });

  // ---- Status Banner ----
  console.log('\n' + '='.repeat(77));
  console.log('  VACFA Bot v2: RUNNING');
  console.log('  Architecture: WebRTC Audio Intercept → Gemini STT → Translation → Broadcast');
  console.log('');
  console.log('  What happens now:');
  console.log('  1. Browser opens to about:blank, then navigates to the Teams meeting.');
  console.log('  2. CSP is bypassed — WASM audio workers will load correctly.');
  console.log('  3. RTCPeerConnection interceptor captures ALL participants\' audio.');
  console.log('  4. Audio chunks (3.5s) are transcribed + translated by Gemini.');
  console.log('  5. Results broadcast to VACFA web app via WebSocket/SSE.');
  console.log('');
  console.log(`  Relay : ws://127.0.0.1:${RELAY_PORT}`);
  console.log(`  Session: ${SESSION_URL}`);
  console.log(`  Press Ctrl+C to stop.`);
  console.log('='.repeat(77) + '\n');
}

main().catch(console.error);
