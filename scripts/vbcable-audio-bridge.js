/**
 * VACFA Translate — Direct VB-Cable Audio Bridge & Sliding-Window VAD Capture
 *
 * Eliminates Teams' single-language DOM Live Captions AND Chrome's broken remote-WebRTC
 * MediaRecorder by routing Teams `<audio>` elements to `CABLE Input (VB-Audio Virtual Cable)`
 * and capturing 16kHz 16-bit mono PCM directly from `CABLE Output (VB-Audio Virtual Cable)`.
 *
 * Supports two modes:
 *  1. In-process mode (`startInProcessVbCableCapture`) — zero Chrome CDP base64 IPC hop,
 *     zero secondary FFmpeg spawn; emits cumulative lossless 16kHz WAV drafts (~1.0s, ~2.1s)
 *     followed by a full-context final WAV slice on clause pause for smooth full-card refinement.
 *  2. Standalone CLI mode (`node scripts/vbcable-audio-bridge.js`) — hot-injectable fallback.
 */

const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9222);
const DSHOW_DEVICE = process.env.VBCABLE_CAPTURE_DEVICE || 'CABLE Output (VB-Audio Virtual Cable)';
const USE_COMPAT_WEBM = process.argv.includes('--compat-webm');

const logger = {
  /**
   * Logs an operational status line.
   * @param {string} scope - Subsystem name
   * @param {string} msg - Message content
   */
  info(scope, msg) {
    process.stdout.write(`${new Date().toISOString()} [INFO] [${scope}] ${msg}\n`);
  },
  /**
   * Logs a warning or error line.
   * @param {string} scope - Subsystem name
   * @param {string} msg - Error details
   */
  warn(scope, msg) {
    process.stderr.write(`${new Date().toISOString()} [WARN] [${scope}] ${msg}\n`);
  },
};

/**
 * Wraps raw 16kHz 16-bit mono s16le PCM bytes in a lossless 44-byte RIFF WAV header
 * so Gemini Multimodal receives uncompressed audio with zero double-Opus consonant smearing.
 * @param {Buffer} pcmBuffer - Raw 16kHz s16le mono PCM bytes
 * @param {number} sampleRate - Sample rate in Hz (default 16000)
 * @returns {Buffer} Lossless WAV buffer
 */
function wrapPcmInWavHeader(pcmBuffer, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Encodes normalized 16kHz PCM to high-bitrate transparent 160kbps WebM/Opus
 * for backward-compatible standalone hot-patching.
 * @param {Buffer} pcmBuffer - Raw 16kHz s16le mono PCM bytes
 * @returns {Promise<Buffer>} High-bitrate WebM/Opus buffer
 */
function encodePcmToTransparentWebm(pcmBuffer) {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 's16le',
      '-ar', '16000',
      '-ac', '1',
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '160k',
      '-application', 'audio',
      '-f', 'webm',
      'pipe:1',
    ]);
    const chunks = [];
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.on('close', () => resolve(Buffer.concat(chunks)));
    ff.on('error', () => resolve(Buffer.alloc(0)));
    ff.stdin.write(pcmBuffer);
    ff.stdin.end();
  });
}

/**
 * JavaScript snippet evaluated inside the Teams Chrome tab to route all meeting `<audio>`
 * playback into VB-Audio Virtual Cable Input and keep Teams' single-language DOM captions silenced.
 */
const ROUTE_TEAMS_AUDIO_TO_VBCABLE_EXPR = `
(async function(){
  window.vacfaSpeechData = function() {};
  window.__VACFA_AUDIO_ONLY_MODE__ = true;

  const devs = await navigator.mediaDevices.enumerateDevices();
  const cableIn = devs.find(d => d.kind === 'audiooutput' && /cable input/i.test(d.label) && d.deviceId !== 'communications');
  if (!cableIn) return { error: 'CABLE Input device not found', outputs: devs.filter(d => d.kind === 'audiooutput').map(d => d.label) };

  async function bindAllAudioToCable() {
    const els = Array.from(document.querySelectorAll('audio, video'));
    let count = 0;
    for (const el of els) {
      if (el.setSinkId && el.sinkId !== cableIn.deviceId) {
        try {
          await el.setSinkId(cableIn.deviceId);
          el.muted = false;
          el.volume = 1.0;
          count++;
        } catch(e) {}
      }
    }
    return count;
  }

  const boundNow = await bindAllAudioToCable();
  if (!window.__VACFA_SINK_WATCHER__) {
    window.__VACFA_SINK_WATCHER__ = setInterval(() => { bindAllAudioToCable().catch(() => {}); }, 2500);
  }

  return { ok: true, sinkLabel: cableIn.label, sinkId: cableIn.deviceId, boundNow };
})()
`;

/**
 * Starts low-latency in-process VB-Cable capture with cumulative sliding-window VAD.
 * Emits speculative drafts (`onDraftSlice`) at ~950ms and every +1,150ms of active speech,
 * then emits the full-context audio (`onFinalSlice`) at natural clause pauses.
 *
 * @param {object} options - Capture configuration
 * @param {(method: string, params?: object) => Promise<object>} [options.cdpSend] - Optional CDP sender to bind Teams `<audio>` sink to CABLE Input
 * @param {(payload: { utteranceId: string, seq: number, wavBase64: string, speechMs: number }) => void} [options.onDraftSlice] - Invoked for incremental live drafts
 * @param {(payload: { utteranceId: string, seq: number, wavBase64: string, speechMs: number }) => void} options.onFinalSlice - Invoked for finalized clauses
 * @param {string} [options.device] - DirectShow audio capture device name
 * @returns {Promise<{ stop: () => void, process: import('child_process').ChildProcess }>}
 */
async function startInProcessVbCableCapture({
  cdpSend,
  onDraftSlice,
  onFinalSlice,
  device = DSHOW_DEVICE,
}) {
  if (cdpSend) {
    try {
      const res = await cdpSend('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: ROUTE_TEAMS_AUDIO_TO_VBCABLE_EXPR,
      });
      logger.info('VBCable', 'Audio Sink Routing Result: ' + JSON.stringify(res?.result?.result?.value));
    } catch (err) {
      logger.warn('VBCable', `Sink routing notice: ${err.message}`);
    }
  }

  // Lower dynaudnorm frame window (f=80ms) + 30ms DirectShow buffer cuts filter lookahead by ~50%
  const ff = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'dshow',
    '-audio_buffer_size', '30',
    '-i', `audio=${device}`,
    '-af', 'highpass=f=85,dynaudnorm=f=80:g=9:m=6',
    '-ar', '16000',
    '-ac', '1',
    '-f', 's16le',
    'pipe:1',
  ]);

  logger.info('VBCable', `In-process 16kHz lossless PCM capture active on "${device}" (Sliding-Window Draft-and-Refine Mode)`);

  let preRollRing = [];
  let pcmChunks = [];
  let speechMs = 0;
  let silentMs = 0;
  let inSpeech = false;
  let utteranceCounter = 0;
  let currentUtteranceId = '';
  let draftSeq = 0;
  let lastDraftAtSpeechMs = 0;

  // Timing constants tuned for ~1.3s Time-to-First-Word + accurate full-context finalization
  const RMS_VOICE_THRESHOLD = 280;
  const FIRST_DRAFT_MS = 950;
  const NEXT_DRAFT_STEP_MS = 1150;
  const MAX_DRAFTS_PER_UTTERANCE = 3;

  ff.stdout.on('data', (pcm) => {
    // 16kHz * 16-bit mono = 32 bytes/ms
    const chunkMs = pcm.length / 32;

    let sumSq = 0;
    const samples = Math.floor(pcm.length / 2);
    for (let i = 0; i < samples; i++) {
      const s = pcm.readInt16LE(i * 2);
      sumSq += s * s;
    }
    const rms = samples > 0 ? Math.sqrt(sumSq / samples) : 0;

    if (!inSpeech) {
      // Retain ~240ms rolling pre-roll so initial consonants are never clipped
      preRollRing.push(pcm);
      if (preRollRing.length > 6) preRollRing.shift();

      if (rms > RMS_VOICE_THRESHOLD) {
        inSpeech = true;
        utteranceCounter++;
        currentUtteranceId = `utt-${Date.now()}-${utteranceCounter}`;
        draftSeq = 0;
        lastDraftAtSpeechMs = 0;
        pcmChunks = [...preRollRing];
        preRollRing = [];
        speechMs = chunkMs;
        silentMs = 0;
      }
      return;
    }

    pcmChunks.push(pcm);
    if (rms > RMS_VOICE_THRESHOLD) {
      speechMs += chunkMs;
      silentMs = 0;
    } else {
      silentMs += chunkMs;
    }

    // 1. Check Final Commit Triggers first (avoid emitting a redundant draft right before a final)
    const genuineEndOfTurn = speechMs >= 600 && silentMs >= 750;
    const fullClausePause = speechMs >= 2000 && silentMs >= 400;
    const wordBoundarySoftCeiling = speechMs >= 4200 && silentMs >= 160;
    const hardSafetyCeiling = speechMs >= 5800;

    if (genuineEndOfTurn || fullClausePause || wordBoundarySoftCeiling || hardSafetyCeiling) {
      const fullPcm = Buffer.concat(pcmChunks);
      const finalUtteranceId = currentUtteranceId;
      const finalSeq = draftSeq + 100;
      const spokenSnapshotMs = Math.round(speechMs);

      pcmChunks = [];
      inSpeech = false;
      speechMs = 0;
      silentMs = 0;
      currentUtteranceId = '';
      draftSeq = 0;
      lastDraftAtSpeechMs = 0;

      if (fullPcm.length >= 14000) {
        const wavBuf = wrapPcmInWavHeader(fullPcm, 16000);
        onFinalSlice({
          utteranceId: finalUtteranceId,
          seq: finalSeq,
          wavBase64: wavBuf.toString('base64'),
          speechMs: spokenSnapshotMs,
        });
      }
      return;
    }

    // 2. Cumulative Speculative Draft Trigger (gives colleagues ~1.3s live card appearance)
    if (onDraftSlice && draftSeq < MAX_DRAFTS_PER_UTTERANCE) {
      const shouldEmitFirstDraft = draftSeq === 0 && speechMs >= FIRST_DRAFT_MS;
      const shouldEmitNextDraft = draftSeq > 0 && speechMs - lastDraftAtSpeechMs >= NEXT_DRAFT_STEP_MS;

      if (shouldEmitFirstDraft || shouldEmitNextDraft) {
        draftSeq++;
        lastDraftAtSpeechMs = speechMs;
        const snapshotPcm = Buffer.concat(pcmChunks);
        const wavBuf = wrapPcmInWavHeader(snapshotPcm, 16000);
        onDraftSlice({
          utteranceId: currentUtteranceId,
          seq: draftSeq,
          wavBase64: wavBuf.toString('base64'),
          speechMs: Math.round(speechMs),
        });
      }
    }
  });

  ff.stderr.on('data', (err) => {
    logger.warn('FFmpeg', err.toString().trim());
  });

  ff.on('close', (code) => {
    logger.warn('FFmpeg', `DirectShow capture exited with code ${code}`);
  });

  return {
    process: ff,
    stop() {
      try {
        ff.kill('SIGTERM');
      } catch {}
    },
  };
}

/**
 * Fetches JSON metadata from the Chrome DevTools Protocol HTTP endpoint (standalone CLI mode).
 * @param {string} urlPath - CDP path (e.g. '/json')
 * @returns {Promise<Array<object>>}
 */
function fetchCdpPages(urlPath = '/json') {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${DEBUG_PORT}${urlPath}`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve([]);
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Standalone CLI entry point for hot-attaching VB-Cable capture to an already-running Chrome CDP tab.
 * @returns {Promise<void>}
 */
async function startVbCableBridge() {
  const pages = await fetchCdpPages('/json');
  const teamsPage = pages.find((p) => p.type === 'page' && p.url && p.url.includes('teams'));
  if (!teamsPage?.webSocketDebuggerUrl) {
    logger.warn('Bridge', 'Could not locate active Teams tab on CDP port ' + DEBUG_PORT);
    process.exit(1);
  }

  const ws = new WebSocket(teamsPage.webSocketDebuggerUrl);
  let cmdId = 1000;

  function cdpCall(method, params = {}) {
    const id = ++cmdId;
    return new Promise((resolve) => {
      const handler = (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id === id) {
            ws.off('message', handler);
            resolve(msg);
          }
        } catch {}
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.on('open', async () => {
    logger.info('Bridge', 'Connected to live Teams Chrome tab via CDP (standalone CLI mode)');
    await startInProcessVbCableCapture({
      cdpSend: cdpCall,
      onFinalSlice: async ({ wavBase64, speechMs, utteranceId }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        let b64 = wavBase64;
        if (USE_COMPAT_WEBM) {
          const rawPcm = Buffer.from(wavBase64, 'base64').subarray(44);
          const webmBuf = await encodePcmToTransparentWebm(rawPcm);
          if (webmBuf.length <= 1000) return;
          b64 = webmBuf.toString('base64');
        }
        logger.info('Bridge', `Injecting slice ${utteranceId} (${Math.round(b64.length * 0.75 / 1024)}KB, ${speechMs}ms speech) -> Gemini`);
        cdpCall('Runtime.evaluate', {
          expression: `if (window.vacfaAudioChunk) window.vacfaAudioChunk(${JSON.stringify(b64)});`,
        }).catch(() => {});
      },
    });
  });

  ws.on('error', (err) => logger.warn('Bridge', `CDP WebSocket error: ${err.message}`));
}

if (require.main === module) {
  startVbCableBridge().catch((err) => {
    logger.warn('Bridge', err.message);
    process.exit(1);
  });
}

module.exports = {
  wrapPcmInWavHeader,
  startInProcessVbCableCapture,
  ROUTE_TEAMS_AUDIO_TO_VBCABLE_EXPR,
};
