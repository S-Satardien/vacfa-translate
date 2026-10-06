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
const mjpegClients = new Set();
let latestFrameBuffer = null;
let wss = null;

const relayServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Live Meeting Video Feed (MJPEG multipart stream - Approach A)
  if (req.url === '/video' || req.url.startsWith('/video')) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'close',
      'Access-Control-Allow-Origin': '*',
    });
    mjpegClients.add(res);
    console.log(`[Relay] 🎥 Live Video client connected (total: ${mjpegClients.size})`);
    if (latestFrameBuffer) {
      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrameBuffer.length}\r\n\r\n`);
        res.write(latestFrameBuffer);
        res.write('\r\n');
      } catch {}
    }
    req.on('close', () => {
      mjpegClients.delete(res);
      console.log(`[Relay] Video client disconnected (remaining: ${mjpegClients.size})`);
    });
    return;
  }

  // Single Frame Snapshot for fallback polling
  if (req.url === '/snapshot' || req.url.startsWith('/snapshot')) {
    if (latestFrameBuffer) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': latestFrameBuffer.length,
        'Cache-Control': 'no-cache, no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(latestFrameBuffer);
    } else {
      res.writeHead(503, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('No frame available yet');
    }
    return;
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'bot_status', connected: true, botName: BOT_NAME, videoAvailable: Boolean(latestFrameBuffer), videoUrl: `http://127.0.0.1:${RELAY_PORT}/video` })}\n\n`);
    sseClients.add(res);
    console.log(`[Relay] SSE client connected (total: ${sseClients.size})`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      botName: BOT_NAME,
      clients: sseClients.size,
      videoClients: mjpegClients.size,
      videoActive: Boolean(latestFrameBuffer),
    }));
    return;
  }
  res.writeHead(404); res.end();
});

relayServer.listen(RELAY_PORT, '127.0.0.1', () => {
  console.log(`[Relay] ws://127.0.0.1:${RELAY_PORT}  |  http://127.0.0.1:${RELAY_PORT}/video  |  /events`);
});

try {
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server: relayServer });
  wss.on('connection', (client) => {
    console.log(`[Relay] WebSocket client connected (total: ${wss.clients.size})`);
    client.send(JSON.stringify({
      type: 'bot_status',
      connected: true,
      botName: BOT_NAME,
      videoAvailable: true,
      videoUrl: `http://127.0.0.1:${RELAY_PORT}/video`,
    }));
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
const AUDIO_SYSTEM_PROMPT = `You are VACFA Translate, an expert real-time simultaneous conference interpreter specializing in African international public health summits and academic addresses.

ABSOLUTE ACOUSTIC GROUNDING (ZERO TOLERANCE FOR HALLUCINATIONS):
- You are an exact acoustic transcription engine. Transcribe ONLY what the human voice literally articulated in the provided audio file.
- DO NOT invent, hallucinate, extrapolate, or assume words that were not audibly uttered.
- NEVER assemble sentences using words from the glossary or naming examples unless the speaker audibly said those exact words in the audio.
- If the audio contains only ambient room tone, microphone hiss, breathing, or silence, you MUST output ONLY: {"noSpeech":true}

AFRICAN NAMES RECOGNITION GUIDE:
Accurately recognize African personal and family names without Anglicizing them:
- Southern Africa: Sipho, Thabo, Nomvula, Nkosazana, Bongani, Zanele, Mandla, Lerato, Kagiso, Tendai, Farai, Chipo, Petronella, Mthokozisi, Sibusiso, Khanyisile, Ayanda, Tshepo, Themba, Lindiwe, Naledi, Puleng, Tau, Kgosi, Mpho, Refilwe, Lebogang, Dineo, Khomotso, Simphiwe, Vuyo, Xolani, Lungile, Nandi, Busisiwe, Nompumelelo, Shabir, Glenda, Salim, Benjamin.
- East Africa: Wanjiku, Kamau, Mwangi, Kipchoge, Ochieng, Otieno, Achieng, Chebet, Kibet, Juma, Baraka, Neema, Amina, Asha, Zawadi, Faraji, Kigozi, Namubiru, Kato, Babirye, Mugisha, Uwase, Habimana, Kebebew, Abebe, Almaz, Desta, Haile, Yohannes.
- West Africa: Chukwuemeka, Ngozi, Babatunde, Olumide, Adebayo, Chioma, Ifeanyi, Chidiemma, Femi, Funmilayo, Folake, Kwame, Kofi, Ama, Akosua, Yaw, Mensah, Boateng, Osei, Diallo, Sow, Traoré, Coulibaly, Koné, Diop, Ndiaye, Cissé, Ba, Fall, Touré.
- Central & Lusophone Africa: Mukendi, Ilunga, Kalonji, Kasongo, Tshisekedi, Mbemba, Ngando, Eyenga, Eto'o, Aboubakar, Mateus, João, Sebastião, Manuel, Esperança, Graça, Afonso, Domingos, Chissano, Mondlane, Nhaca, Macamo.

VACFA & NISH TEAM MEMBERS, FACULTY & CLINICAL PERSONNEL (CANONICAL SPELLING & IDENTITIES):
Always transcribe and preserve the exact spelling of these team members and meeting participants:
- Xolie Ndlela (Administrative Officer, pronounced /zoh-lee/ or /koh-lee/ with soft click; often phonetically misheard as "collie", "coley", or "jolly"; ALWAYS transcribe as "Xolie")
- Edina Amponsah-Dacosta (Senior Research Officer)
- Saleem Satardien (Online Learning Environment Developer)
- Alana Keyser (Project Manager)
- Hilary Basson (Research Nurse)
- Benjamin Kagina / Ben (Chief Research Officer)
- Gladstone Madito (Lecturer)
- Liza Rossi (Research Officer, Timber Study)
- Martie Abraham (Team Member)
- Gregory Hussey / Greg (Senior Scholar & Emeritus Professor)
- Petronella Ncube / Polly (Project Manager, NISH & VPOP)
- Imen Ayouni Ep Labidi (Team Member)
- Ramonde Patientia (Senior Research Officer)
- Adelaide Masu (Senior Lecturer)
- Christine Ritchie (Project Manager, Timber Study)
- Dilshaad Brey (Senior Librarian)
- Nolitha / Nolu (Research Assistant)
- Anthony Hawkridge / Tony (Senior Research Officer)
- Bronte Davies (Junior Research Officer)
- Marthe Penka (Team Member)
- Elloise Du Toit (Senior Research Officer)
- Elizabeth Oduwole (Research Officer)
- Tshepiso Mbangiwa / Chepy (Team Member & Researcher)
- Lubayna Khan (Research Assistant)
- Rudzani Muloiwa (Professor & Head of Department)
- Funke Alaba (Health Economist & Senior Collaborator, UCT)
- Richard White (Professor of Infectious Disease Modelling, LSHTM)
- Timber Study / #TimberStudy (Clinical trial / research protocol)

TRANSLATION INTEGRITY RULE FOR PROPER NAMES & CONCISENESS:
- In translated subtitles and speech (French, Portuguese, Swahili), PROPER PERSONAL NAMES MUST REMAIN COMPLETELY UNCHANGED.
- NEVER translate proper names or surnames into dictionary words (e.g., NEVER translate "Patientia" into French "Patience", NEVER translate "Gladstone", "Davies", or "White").
- CONCISE SIMULTANEOUS INTERPRETATION: Strip meaningless conversational hesitation markers (e.g. "Um", "Uh", "Er", "Hmm", and false-start stutters) from all translation outputs. Deliver clean, professional, concise translations directly.

VACFA & NISH INSTITUTIONAL, CLINICAL & STUDY VOCABULARY:
- "NISH" / "NISH 2.0": Spoken as /neesh/. Transcribe as "NISH" (Network for Immunization Specialists), NEVER as "Niche" or "Nietzsche".
- "PICARD" / "PICARD Fund": Spoken as /pih-kard/ or /py-kard/. UCT VACFA internal funding account mechanism.
- "AVC": Spoken as /ay-vee-see/. African Vaccinology Course (annual pan-African training).
- "TDEP Study": Spoken as /tee-dep/. Tdap / pertussis clinical trial protocol approved by Sanofi Scientific Committee.
- "TTAP Study": Spoken as /tee-tap/. Vaccine serology and antibody study protocol.
- "VPOP": Spoken as /vee-pop/. Vaccine Policy / Prioritization and Optimization Platform workshop (Gates & WHO).
- "NMAT": Spoken as /en-mat/. NITAG Maturity Assessment Tool (Africa CDC & WHO framework).
- "HREC" / "HRAC": Spoken as /aych-rek/ or /aych-rak/. UCT Health Research Ethics Committee.
- "SPHFM": School of Public Health and Family Medicine (UCT).
- "MEL": Monitoring, Evaluation, and Learning framework & Theory of Change.
- "MPACS": Mpox Preparedness and Case Study for NITAG training.
- "PCV10" / "PCV13": Pneumococcal Conjugate Vaccine formulations (e.g. Mali NITAG switch).
- "RSV": Respiratory Syncytial Virus maternal vaccine / monoclonal antibody programs.
- Partners: Wellcome Trust, Gates Foundation, Task Force for Global Health, Sanofi Scientific Committee.
- Employment Equity (EE): UCT transformation and disability self-declaration targets.

AFRICAN LINGUISTIC ZONES & ACCENT SENSITIVITY:
1. Anglophone Africa (South Africa en-ZA, Nigeria en-NG, Kenya en-KE, Ghana en-GH):
   - South African English phonology (centralized kit/pin vowels, non-rhotic cadence, glottal stops, unstressed diphthongs).
   - "Matric" (Grade 12 National Senior Certificate, NEVER transcribe as "Matrix"), "Heathfield", "tertiary", "educators", "alumni", "CHW" (Community Health Worker).
2. Francophone Africa (Senegal, Côte d'Ivoire, DRC, Cameroon, Rwanda):
   - African French vowel cadence and technical terms: PEV (Programme Élargi de Vaccination), MAPI (Manifestations Post-vaccinales Indésirables), chaîne du froid, surveillance épidémiologique.
3. Lusophone Africa (Angola pt-AO, Mozambique pt-MZ - PALOP):
   - Transcribe and translate into African/European Portuguese: PAV (Programa Alargado de Vacinação), EAPV (Eventos Adversos Pós-Vacinação), cadeia de frio. Avoid Brazilian colloquialisms.
4. East & Central African Kiswahili:
   - Authentic Swahili public health terminology: Chanjo, Kinga ya jamii, Mlolongo wa baridi.

COMPREHENSIVE VACCINOLOGY & MEDICAL TERMINOLOGY:
- Immunological: Seroconversion, Neutralizing antibodies, T-cell mediated immunity, Adjuvant, Titer, Epitope, Inactivated vaccine, Live-attenuated vaccine, Subunit vaccine, Conjugate vaccine, Toxoid, Recombinant, Monovalent, Polyvalent, Anamnestic response, Correlates of protection, Breakthrough infection, Seroprevalence, Immunogenicity, Reactogenicity, Cross-reactivity, Maternal immunization.
- Safety & Pharmacovigilance: AEFI (Adverse Events Following Immunization), AESI (Adverse Events of Special Interest), Causality assessment, Brighton Collaboration criteria, Signal detection, Anaphylaxis, Guillain-Barré syndrome, Myocarditis, Thrombosis with thrombocytopenia syndrome (TTS), Passive surveillance, Active surveillance, Spontaneous reporting, GACVS.
- Logistics & Cold Chain: Ultra-low temperature (ULT) freezer (-80°C), Vaccine Vial Monitor (VVM), Diluent, Reconstitution, Shake test, Multi-Dose Vial Policy (MDVP), Wastage rate, Open vial wastage, Closed vial wastage, Cold box, Vaccine carrier, Ice pack, Buffer stock, Lot release, Cold life.
- Programmatic & Institutions: Zero-dose children, Missed opportunities for vaccination (MOV), Reaching Every District (RED) strategy, Routine immunization, Supplementary Immunization Activities (SIA), SAGE, NITAG, SAHPRA, Africa CDC, WHO AFRO, Gavi, UNICEF.

OUTPUT FORMAT:
Output ONLY valid compact JSON:
{"transcript":"...","detectedLanguage":"en","speaker":"Speaker","translations":{"en":"...","fr":"...","pt":"...","sw":"..."},"detectedGlossaryTerms":[]}`;

let audioCallCount = 0;
let lastSpokenContext = '';

/**
 * Sends a WebM audio chunk to Gemini for combined STT + translation.
 * @param {string} base64Audio - Base64-encoded audio/webm data
 * @returns {Promise<object|null>} Parsed result or null on failure
 */
async function transcribeAndTranslateAudio(base64Audio) {
  const rawKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!rawKey) { console.error('[Gemini] No API key'); return null; }
  const apiKeys = rawKey.split(',').map((k) => k.trim()).filter(Boolean);
  const apiKey = apiKeys[audioCallCount % apiKeys.length];

  const candidateModels = [
    process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6500);

      const promptText = 'Transcribe ONLY the audibly spoken human speech in this audio chunk. If silence or noise, reply {"noSpeech":true}. NEVER hallucinate or invent sentences.';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
              { text: promptText },
            ],
          }],
          systemInstruction: { parts: [{ text: AUDIO_SYSTEM_PROMPT }] },
          generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        let errMsg = '';
        try {
          const errJson = await res.json();
          errMsg = errJson?.error?.message || JSON.stringify(errJson);
        } catch {
          errMsg = await res.text().catch(() => '');
        }
        console.warn(`[Gemini Audio] ${model} HTTP ${res.status}: ${errMsg.slice(0, 160)}`);
        if (res.status === 429) {
          console.warn(`[Gemini Audio] Rate limit reached. Pausing 500ms before retry...`);
          await new Promise((r) => setTimeout(r, 500));
        }
        continue;
      }
      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (parsed.noSpeech) return null;

      audioCallCount++;
      parsed._model = model;
      return parsed;
    } catch (fetchErr) {
      console.warn(`[Gemini Audio] ${model} network error: ${fetchErr.message}`);
    }
  }
  return null;
}

// ============================================================================
// 4. Gemini — Text-Only Translation (fallback for caption scraping path)
// ============================================================================
// 4. Gemini — Text-Only Translation & Speech Normalization Helpers
// ============================================================================

/**
 * Detects whether a string is a non-speech Teams system toast or browser UI notice.
 * @param {string} text
 * @returns {boolean}
 */
function isSystemMessageOrToast(text) {
  if (!text) return true;
  const t = text.trim();
  // Teams UI status announcements, meeting toasts, and browser notifications
  if (/^zoom is reset/i.test(t)) return true;
  if (/^zoom (in|out|level)/i.test(t)) return true;
  if (/^(recording|transcription|live captions) (has |is )?(started|stopped|on|off)/i.test(t)) return true;
  if (/^you('re| are) muted/i.test(t)) return true;
  if (/^screen sharing (started|stopped)/i.test(t)) return true;
  if (/^(camera|microphone) is (turned on|turned off)/i.test(t)) return true;
  return false;
}

/**
 * Normalizes acoustic mishearings, strips disfluencies, and cleans speech before translation & TTS.
 * @param {string} text
 * @returns {string}
 */
function cleanAndNormalizeSpokenText(text) {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Context & Acoustic Name Normalization (common ASR mishearings)
  cleaned = cleaned
    // Xolie Ndlela (often misheard as collie, coley, jolly)
    .replace(/\b([Cc]ollie|[Cc]oley|[Jj]olly)\b/g, 'Xolie')
    // NISH / NISH 2.0 (often misheard as niche, nietzsche)
    .replace(/\b([Nn]iche|[Nn]ietzsche)\b/g, 'NISH')
    // PICARD Fund (often misheard as p-card, pickard)
    .replace(/\b([Pp]-?[Cc]ard|[Pp]ickard)\b/g, 'PICARD')
    // Studies and protocols
    .replace(/\b([Tt]-?[Tt]ap)\b/g, 'TTAP')
    .replace(/\b([Tt]-?[Dd]ep)\b/g, 'TDEP')
    .replace(/\b([Vv]-?[Pp]op)\b/g, 'VPOP')
    .replace(/\b([Mm]-?[Pp]acks|[Mm]pac[ks])\b/gi, 'MPACS')
    .replace(/\b([Cc]hepie?)\b/g, 'Chepy')
    // Education terms in SA context
    .replace(/\b([Mm]atrix)\b/g, (match, p1, offset, str) => {
      return /results|tertiary|senior|grade|school|student|pass/i.test(str) ? 'Matric' : match;
    });

  // 2. Disfluency & Vocal Hesitation Stripping
  // Leading fillers: "Um, ", "Uh, ", "Uhm, ", "Ah, ", "Er, "
  cleaned = cleaned.replace(/^(um|uh|uhm|ah|er|hmm)[,\s]+/i, '');
  // Trailing fillers: ", um", ", uh"
  cleaned = cleaned.replace(/[,\s]+(um|uh|uhm|ah|er|hmm)$/i, '');
  // Inline standalone fillers with surrounding punctuation: "..., um, ..." -> "..., ..."
  cleaned = cleaned.replace(/,\s*(um|uh|uhm|er|hmm)\s*,/gi, ',');
  cleaned = cleaned.replace(/\s+(um|uh|uhm|er|hmm)\s+/gi, ' ');

  // 3. De-duplicate immediate stuttered word repetitions ("can can you" -> "can you", "we we" -> "we")
  cleaned = cleaned.replace(/\b([A-Za-z]+)\s+\1\b/gi, '$1');

  // 4. Remove conversational apologetic stutter if trailing ("..., sorry I can't")
  cleaned = cleaned.replace(/,\s*sorry[,\s]+i can'?t$/i, '');

  return cleaned.trim();
}

const TEXT_TRANSLATION_PROMPT = `
You are VACFA Translate, an expert simultaneous interpreter. Translate the given text into en, fr, pt, sw.
Clean away vocal hesitation sounds (e.g. "Um", "Uh", "Er", "Hmm") from all translation outputs.
Use VACFA medical and institutional glossary terms where applicable.
Output ONLY valid JSON:
{ "detectedLanguage":"en", "translations":{"en":"...","fr":"...","pt":"...","sw":"..."}, "detectedGlossaryTerms":[] }`;

async function translateText(text, speaker = 'Participant') {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackTranslate(text);

  const candidateModels = [
    process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7500);
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
      if (!res.ok) {
        let errMsg = '';
        try {
          const errJson = await res.json();
          errMsg = errJson?.error?.message || JSON.stringify(errJson);
        } catch {
          errMsg = await res.text().catch(() => '');
        }
        console.warn(`[Gemini Text] ${model} HTTP ${res.status}: ${errMsg.slice(0, 160)}`);
        continue;
      }
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
    } catch (fetchErr) {
      console.warn(`[Gemini Text] ${model} network error: ${fetchErr.message}`);
    }
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
 * Script A — WebRTC Audio Interceptor (Direct Track Capture)
 *
 * Hooks RTCPeerConnection and HTMLMediaElement.srcObject.
 * When Teams delivers an audio track (e.g. mainAudio), attaches a direct
 * MediaRecorder to that stream in 2.0s Opus slices.
 * Eliminates Web Audio API context-suspension and volume threshold drops.
 */
const AUDIO_INTERCEPTOR_SCRIPT = `
(function(){
  if(window.__VACFA_RTC_HOOKED__)return;
  window.__VACFA_RTC_HOOKED__=true;

  const LOG='[VACFA Audio]';
  const seenTracks=new Set();

  function startDirectTrackRecorder(track,sourceLabel){
    if(!track||track.kind!=='audio')return;
    if(seenTracks.has(track.id))return;
    seenTracks.add(track.id);

    console.log(LOG,'Attaching direct recorder to track ('+sourceLabel+'):',track.id);

    const stream=new MediaStream([track]);

    try{
      const audioEl=document.createElement('audio');
      audioEl.srcObject=stream;
      audioEl.autoplay=true;
      audioEl.volume=1.0;
      (document.body||document.documentElement).appendChild(audioEl);
    }catch(e){}

    let sliceRecorder=null;
    let sliceChunks=[];
    let isStopped=false;
    let safetyTimer=null;
    let isLoopRunning=false;
    let hasAcousticSpeech=false;

    let analyser=null;
    let freqData=null;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC){
        const actx=new AC();
        const src=actx.createMediaStreamSource(stream);
        analyser=actx.createAnalyser();
        analyser.fftSize=256;
        src.connect(analyser);
        freqData=new Uint8Array(analyser.frequencyBinCount);
      }
    }catch(e){}

    function recordLoop(){
      if(isStopped||track.readyState==='ended'||isLoopRunning)return;
      isLoopRunning=true;

      if(safetyTimer){
        clearTimeout(safetyTimer);
        safetyTimer=null;
      }

      sliceChunks=[];
      hasAcousticSpeech=false;
      let consecutiveSilence=0;
      const startTime=Date.now();

      try{
        sliceRecorder=new MediaRecorder(stream,{
          mimeType:'audio/webm;codecs=opus',
          audioBitsPerSecond:128000
        });
      }catch(e){
        try{
          sliceRecorder=new MediaRecorder(stream);
        }catch(e2){
          console.error(LOG,'MediaRecorder create failed:',e2);
          isLoopRunning=false;
          setTimeout(recordLoop,1500);
          return;
        }
      }

      function stopActiveRecorder(){
        if(safetyTimer){
          clearTimeout(safetyTimer);
          safetyTimer=null;
        }
        if(sliceRecorder&&sliceRecorder.state==='recording'){
          try{sliceRecorder.stop();}catch(err){}
        }
      }

      sliceRecorder.ondataavailable=(e)=>{
        if(e.data&&e.data.size>0){
          sliceChunks.push(e.data);
          let currentRms=0;
          if(analyser&&freqData){
            try{
              analyser.getByteFrequencyData(freqData);
              let sum=0;
              for(let i=0;i<freqData.length;i++)sum+=freqData[i];
              currentRms=sum/freqData.length;
            }catch(e){}
          }
          // Real human speech frequency energy is > 8; room silence / background hiss is 0-3
          if(currentRms>8){
            hasAcousticSpeech=true;
            consecutiveSilence=0;
          }else{
            consecutiveSilence++;
          }
          const elapsed=Date.now()-startTime;
          // Natural sentence boundary: real speech occurred, >= 2.2s elapsed, and speaker paused for ~500ms (2 ticks of 250ms)
          if(hasAcousticSpeech && elapsed>=2200 && consecutiveSilence>=2){
            stopActiveRecorder();
          }
        }
      };

      sliceRecorder.onstop=async()=>{
        if(safetyTimer){
          clearTimeout(safetyTimer);
          safetyTimer=null;
        }
        isLoopRunning=false;
        const chunks=sliceChunks;
        const hadVoice=hasAcousticSpeech;
        hasAcousticSpeech=false;
        setTimeout(recordLoop,30);

        // ONLY emit to Gemini if REAL acoustic speech was detected in this slice!
        if(chunks.length>0 && hadVoice){
          try{
            const blob=new Blob(chunks,{type:'audio/webm'});
            if(blob.size > 4000){
              const buf=await blob.arrayBuffer();
              const bytes=new Uint8Array(buf);
              let binary='';
              const CHUNK=8192;
              for(let i=0;i<bytes.length;i+=CHUNK){
                binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));
              }
              const b64=btoa(binary);
              if(window.vacfaAudioChunk){
                console.log(LOG,'Emitting speech slice ('+Math.round(blob.size/1024)+'KB) from '+track.id);
                window.vacfaAudioChunk(b64);
              }
            }
          }catch(encodeErr){
            console.error(LOG,'Encode error:',encodeErr);
          }
        }
      };

      sliceRecorder.onerror=()=>{
        if(safetyTimer){
          clearTimeout(safetyTimer);
          safetyTimer=null;
        }
        isLoopRunning=false;
        setTimeout(recordLoop,800);
      };

      // Poll in 250ms intervals for rapid acoustic responsiveness
      sliceRecorder.start(250);

      // Max safety ceiling for uninterrupted talking: 4.5 seconds (prevents huge audio slices)
      safetyTimer=setTimeout(()=>{
        stopActiveRecorder();
      },4500);
    }

    track.addEventListener('ended',()=>{
      isStopped=true;
      if(sliceRecorder&&sliceRecorder.state==='recording'){
        try{sliceRecorder.stop();}catch(e){}
      }
    });

    recordLoop();
  }

  /* ---- Hook RTCPeerConnection ---- */
  const OrigPC=window.RTCPeerConnection;
  if(OrigPC){
    window.RTCPeerConnection=function(...args){
      const pc=new OrigPC(...args);
      pc.addEventListener('track',(ev)=>{
        if(ev.track&&ev.track.kind==='audio'){
          startDirectTrackRecorder(ev.track,'RTCPeerConnection');
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
              startDirectTrackRecorder(t,'HTMLMediaElement.srcObject');
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
    /^connecting\.{0,3}$/i,
    /^hold on\.{0,3}$/i,
    /^setting up\.{0,3}$/i,
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

/**
 * Script D — Teams Stage Optimizer
 *
 * Removes non-essential Teams UI chrome (top toolbar, participant side tiles)
 * so the shared presentation / screen-share takes up 100% of the viewport.
 */
const TEAMS_STAGE_OPTIMIZER_SCRIPT = `
(function() {
  function optimizeTeamsStage() {
    try {
      if (!document.getElementById('vacfa-clean-stage-styles')) {
        const style = document.createElement('style');
        style.id = 'vacfa-clean-stage-styles';
        style.textContent = \`
          /* Hide Teams top header and meeting call bar */
          div[data-tid="calling-top-bar"],
          div[class*="calling-top-bar"],
          div[class*="CallingTopBar"],
          header[role="banner"],
          nav[role="navigation"],
          div[class*="header-bar"] {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }

          /* Hide participant side gallery avatar tiles when content/slides are shared */
          div[data-tid="calling-side-gallery"],
          div[class*="side-gallery"],
          div[class*="SideGallery"],
          div[data-tid="side-gallery-item"],
          div[class*="sideGallery"] {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            opacity: 0 !important;
          }

          /* Hide side roster / chat panels that occupy presentation stage space */
          div[data-tid="roster-panel"],
          div[class*="roster-panel"],
          div[class*="right-panel"] {
            display: none !important;
            width: 0 !important;
          }

          /* Maximize presentation / screen share surface to full viewport */
          div[data-tid="screen-share-surface"],
          div[data-tid="stage-view"],
          div[data-tid="calling-active-speaker"],
          div[data-tid="presentation-layout"],
          div[class*="stage-view"],
          div[class*="screen-share-surface"] {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            z-index: 100 !important;
          }

          video {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
          }
        \`;
        (document.head || document.documentElement).appendChild(style);
      }
    } catch {}
  }

  optimizeTeamsStage();
  setInterval(optimizeTeamsStage, 1500);
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
    '--window-size=1920,1080',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    '--run-all-compositor-stages-before-draw',
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

    // 1b. Prevent Chrome from throttling timers/screencast when the bot tab is in background
    try {
      await cdpSend('Emulation.setFocusEmulationEnabled', { enabled: true });
      await cdpSend('Page.setWebLifecycleState', { state: 'active' });
      console.log('[Bot] ✅ Background execution locked — continuous screencast active without tab-switching');
    } catch {}

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
    await cdpSend('Page.addScriptToEvaluateOnNewDocument', { source: TEAMS_STAGE_OPTIMIZER_SCRIPT });
    console.log('[Bot] ✅ Pre-load interceptors & stage optimizer armed for page loads');

    // 5. Evaluate immediately on the currently loaded page
    await cdpSend('Runtime.evaluate', { expression: AUDIO_INTERCEPTOR_SCRIPT });
    await cdpSend('Runtime.evaluate', { expression: PRE_JOIN_SCRIPT });
    await cdpSend('Runtime.evaluate', { expression: CAPTION_OBSERVER_SCRIPT });
    await cdpSend('Runtime.evaluate', { expression: TEAMS_STAGE_OPTIMIZER_SCRIPT });
    console.log('[Bot] ✅ Interceptors & stage optimizer activated on current Teams tab');

    // 6. Keep active monitor alive to handle dynamically added elements / iframes
    setInterval(() => {
      cdpSend('Runtime.evaluate', { expression: PRE_JOIN_SCRIPT }).catch(() => {});
      cdpSend('Runtime.evaluate', { expression: CAPTION_OBSERVER_SCRIPT }).catch(() => {});
      cdpSend('Runtime.evaluate', { expression: TEAMS_STAGE_OPTIMIZER_SCRIPT }).catch(() => {});
    }, 2000);

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

    // 9. Start CDP Screencast for Live Meeting Video Relay (Approach A) Full HD 1080p
    try {
      await cdpSend('Page.startScreencast', {
        format: 'jpeg',
        quality: 80,
        maxWidth: 1920,
        maxHeight: 1080,
        everyNthFrame: 2,
      });
      console.log(`[Bot] 🎥 Live Screencast active (Full HD 1920x1080 JPEG @ 80%) → http://127.0.0.1:${RELAY_PORT}/video`);
      broadcastToClients({ type: 'video_status', active: true, videoUrl: `http://127.0.0.1:${RELAY_PORT}/video` });
    } catch (scErr) {
      console.warn('[Bot] Screencast start notice:', scErr.message);
    }
  });

  // Unified deduplication ring buffer across audio chunks and live captions
  const recentPhrases = [];
  function checkAndRecordPhrase(text) {
    const clean = text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length < 3) return false;
    const now = Date.now();
    while (recentPhrases.length > 0 && now - recentPhrases[0].time > 15000) {
      recentPhrases.shift();
    }
    for (const item of recentPhrases) {
      if (item.clean === clean || (clean.length > 10 && item.clean.includes(clean)) || (item.clean.length > 10 && clean.includes(item.clean))) {
        return false;
      }
    }
    recentPhrases.push({ clean, time: now });
    return true;
  }

  // Multi-Worker Audio Processing Queue — high throughput, ultra-low latency
  const audioQueue = [];
  let activeWorkers = 0;
  const MAX_CONCURRENT_WORKERS = 3;

  function enqueueAudioChunk(b64) {
    // If the queue has more than 2 pending chunks (due to a transient network lag),
    // drop the oldest stale chunk to ensure subtitles remain locked to the live speaker in real time!
    while (audioQueue.length > 2) {
      console.log('[Bot] ⚡ Dropping stale audio chunk to maintain real-time speaker synchrony');
      audioQueue.shift();
    }
    audioQueue.push(b64);
    dispatchWorkers();
  }

  function dispatchWorkers() {
    while (audioQueue.length > 0 && activeWorkers < MAX_CONCURRENT_WORKERS) {
      activeWorkers++;
      const b64 = audioQueue.shift();
      processSingleAudioChunk(b64);
    }
  }

  async function processSingleAudioChunk(b64) {
    try {
      const sizeKB = Math.round(b64.length * 0.75 / 1024);
      const t0 = Date.now();
      const result = await transcribeAndTranslateAudio(b64);
      const elapsed = Date.now() - t0;

      if (result && result.transcript && result.transcript.trim()) {
        const rawSpoken = result.transcript.trim();
        const spoken = cleanAndNormalizeSpokenText(rawSpoken);
        if (spoken && spoken.length > 1 && checkAndRecordPhrase(spoken)) {
          lastSpokenContext = spoken.slice(-150);
          const speaker = result.speaker || 'Meeting Speaker';

          // Clean translations to ensure TTS and subtitles stay concise and filler-free
          const cleanTranslations = {};
          for (const [lang, trText] of Object.entries(result.translations || {})) {
            cleanTranslations[lang] = cleanAndNormalizeSpokenText(trText);
          }

          console.log(`\n🎙️  [${speaker}] (AI: ${elapsed}ms): "${spoken}"`);
          console.log(`🌍  FR: "${cleanTranslations.fr || ''}" | PT: "${cleanTranslations.pt || ''}" | SW: "${cleanTranslations.sw || ''}"`);

          const entry = {
            id: `bot-audio-${Date.now()}`,
            speaker: `${speaker} (${(result.detectedLanguage || 'en').toUpperCase()})`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            originalText: spoken,
            translations: cleanTranslations,
            glossaryTerms: result.detectedGlossaryTerms || [],
          };

          broadcastToClients({ type: 'caption', caption: entry });

          if (CART_URL) {
            const cartLang = process.env.CART_LANGUAGE || 'fr';
            const cartText = cleanTranslations[cartLang] || spoken;
            sendCartCaption(CART_URL, cartText, speaker).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[Bot] Worker error:', err.message);
    } finally {
      activeWorkers--;
      if (audioQueue.length > 0) {
        setImmediate(dispatchWorkers);
      }
    }
  }

  // ---- Handle CDP messages ----
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }

    // ---- SCREENCAST FRAME (Live Meeting Video Feed - Approach A) ----
    if (msg.method === 'Page.screencastFrame') {
      const { data, sessionId } = msg.params || {};
      if (sessionId !== undefined) {
        cdpSend('Page.screencastFrameAck', { sessionId }).catch(() => {});
      }
      if (data) {
        latestFrameBuffer = Buffer.from(data, 'base64');
        if (mjpegClients.size > 0) {
          const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrameBuffer.length}\r\n\r\n`;
          for (const clientRes of mjpegClients) {
            try {
              clientRes.write(header);
              clientRes.write(latestFrameBuffer);
              clientRes.write('\r\n');
            } catch {
              mjpegClients.delete(clientRes);
            }
          }
        }
      }
      return;
    }

    // ---- AUDIO CHUNK received from browser ----
    if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === 'vacfaAudioChunk') {
      const b64 = msg.params.payload;
      if (b64 && b64.length > 100) {
        enqueueAudioChunk(b64);
      }
    }

    // ---- CAPTION TEXT received from DOM observer (sub-second fast path) ----
    if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === 'vacfaSpeechData') {
      try {
        const data = JSON.parse(msg.params.payload);
        const { speaker, text } = data;
        if (!text || text.length < 3) return;

        // Discard non-speech UI system notifications ("Zoom is reset to 100%", etc.)
        if (isSystemMessageOrToast(text)) return;

        const cleanedText = cleanAndNormalizeSpokenText(text);
        if (!cleanedText || cleanedText.length < 2) return;

        if (checkAndRecordPhrase(cleanedText)) {
          console.log(`\n📝 [Live Captions Fast-Path] ${speaker}: "${cleanedText}"`);
          translateText(cleanedText, speaker).then((tr) => {
            const entry = {
              id: `bot-cap-${Date.now()}`,
              speaker: `${speaker} (${tr.sourceLang.toUpperCase()})`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              originalText: cleanedText,
              translations: tr.translations,
              glossaryTerms: tr.glossaryTerms,
            };

            broadcastToClients({ type: 'caption', caption: entry });

            if (CART_URL) {
              const cartLang = process.env.CART_LANGUAGE || 'fr';
              sendCartCaption(CART_URL, tr.translations[cartLang] || cleanedText, speaker).catch(() => {});
            }
          }).catch(() => {});
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
  console.log(`  6. Live meeting video stream (MJPEG) served on http://127.0.0.1:${RELAY_PORT}/video`);
  console.log('');
  console.log(`  Relay : ws://127.0.0.1:${RELAY_PORT}  |  Video: http://127.0.0.1:${RELAY_PORT}/video`);
  console.log(`  Session: ${SESSION_URL}`);
  console.log(`  Press Ctrl+C to stop.`);
  console.log('='.repeat(77) + '\n');
}

main().catch(console.error);
