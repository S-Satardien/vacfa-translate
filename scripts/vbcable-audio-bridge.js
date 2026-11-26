/**
 * VACFA Translate — Direct VB-Cable Audio Bridge for Microsoft Teams Bot
 *
 * Bypasses Microsoft Teams' single-language DOM Live Captions AND Chrome's broken
 * remote-WebRTC MediaRecorder (`recBytes: 0`) by:
 *  1. Routing the live Teams Chrome tab's <audio> elements to `CABLE Input (VB-Audio Virtual Cable)`
 *     via `HTMLMediaElement.setSinkId()`.
 *  2. Silencing the Teams DOM caption binding (`window.vacfaSpeechData`) so single-language
 *     Teams ASR hallucinations never pollute bilingual meetings.
 *  3. Capturing 16kHz 16-bit mono PCM directly from `CABLE Output (VB-Audio Virtual Cable)`
 *     via FFmpeg DirectShow, slicing on word-boundary soft pauses (1.8s-3.0s), encoding to
 *     WebM/Opus, and injecting straight into `window.vacfaAudioChunk` for Gemini Multimodal.
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
 * Fetches JSON metadata from the Chrome DevTools Protocol HTTP endpoint.
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
 * for hot-patching an already-running `teams-bot-runner.js` process expecting `audio/webm`.
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
 * Connects to the live Teams Chrome tab, switches its audio sink to VB-Audio Virtual Cable,
 * disables Teams' single-language DOM captions, and streams direct bilingual audio to Gemini.
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

  /**
   * Sends a CDP command over the active WebSocket.
   * @param {string} method - CDP method name
   * @param {object} params - CDP parameters
   * @returns {Promise<object>}
   */
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
    logger.info('Bridge', 'Connected to live Teams Chrome tab via CDP');

    // 1. Disable Teams single-language DOM caption path & route <audio> elements to CABLE Input
    const setupRes = await cdpCall('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (async function(){
          // Silence single-language Teams DOM captions so English/French switching is 100% Gemini Direct Audio
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
            window.__VACFA_SINK_WATCHER__ = setInterval(() => { bindAllAudioToCable().catch(() => {}); }, 3000);
          }

          return { ok: true, sinkLabel: cableIn.label, sinkId: cableIn.deviceId, boundNow };
        })()
      `,
    });

    logger.info('Bridge', 'Audio Sink Routing Result: ' + JSON.stringify(setupRes?.result?.result?.value));

    // 2. Start continuous FFmpeg DirectShow capture with broadcast loudness normalization
    const ff = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'dshow',
      '-audio_buffer_size', '50',
      '-i', `audio=${DSHOW_DEVICE}`,
      '-af', 'highpass=f=85,dynaudnorm=f=150:g=11:m=6',
      '-ar', '16000',
      '-ac', '1',
      '-f', 's16le',
      'pipe:1',
    ]);

    logger.info('Bridge', `Direct 16kHz PCM Audio Capture active on "${DSHOW_DEVICE}" (100% Audio-Only Bilingual Mode)`);

    let preRollRing = [];
    let pcmChunks = [];
    let speechMs = 0;
    let silentMs = 0;
    let inSpeech = false;
    let sliceCount = 0;

    ff.stdout.on('data', async (pcm) => {
      // 16kHz * 16-bit mono = 32 bytes per millisecond
      const chunkMs = pcm.length / 32;

      let sumSq = 0;
      const samples = Math.floor(pcm.length / 2);
      for (let i = 0; i < samples; i++) {
        const s = pcm.readInt16LE(i * 2);
        sumSq += s * s;
      }
      const rms = samples > 0 ? Math.sqrt(sumSq / samples) : 0;

      if (!inSpeech) {
        // Keep ~250ms rolling pre-roll so initial consonants are never clipped
        preRollRing.push(pcm);
        if (preRollRing.length > 5) preRollRing.shift();

        if (rms > 280) {
          inSpeech = true;
          pcmChunks = [...preRollRing];
          preRollRing = [];
          speechMs = chunkMs;
          silentMs = 0;
        }
        return;
      }

      pcmChunks.push(pcm);
      if (rms > 280) {
        speechMs += chunkMs;
        silentMs = 0;
      } else {
        silentMs += chunkMs;
      }

      // Contextual full-sentence segmentation (eliminates 1-2 word fragments like "So it's" / "10:30")
      const genuineEndOfTurn = speechMs >= 650 && silentMs >= 900;
      const fullClausePause = speechMs >= 2600 && silentMs >= 450;
      const wordBoundarySoftCeiling = speechMs >= 4800 && silentMs >= 180;
      const hardSafetyCeiling = speechMs >= 6500;

      if (genuineEndOfTurn || fullClausePause || wordBoundarySoftCeiling || hardSafetyCeiling) {
        const fullPcm = Buffer.concat(pcmChunks);
        const spokenSnapshotMs = Math.round(speechMs);
        pcmChunks = [];
        inSpeech = false;
        speechMs = 0;
        silentMs = 0;

        if (fullPcm.length >= 16000) {
          const payloadBuf = USE_COMPAT_WEBM
            ? await encodePcmToTransparentWebm(fullPcm)
            : wrapPcmInWavHeader(fullPcm, 16000);
          if (payloadBuf.length > 1000 && ws.readyState === WebSocket.OPEN) {
            sliceCount++;
            const b64 = payloadBuf.toString('base64');
            const fmtLabel = USE_COMPAT_WEBM ? '160k-Opus+dynaudnorm' : 'Lossless-WAV+dynaudnorm';
            logger.info('Bridge', `Injecting Full-Context slice #${sliceCount} (${Math.round(payloadBuf.length / 1024)}KB ${fmtLabel}, ${spokenSnapshotMs}ms active speech) -> Gemini`);
            cdpCall('Runtime.evaluate', {
              expression: `if (window.vacfaAudioChunk) window.vacfaAudioChunk(${JSON.stringify(b64)});`,
            }).catch(() => {});
          }
        }
      }
    });

    ff.stderr.on('data', (err) => {
      logger.warn('FFmpeg', err.toString().trim());
    });

    ff.on('close', (code) => {
      logger.warn('FFmpeg', `DirectShow capture exited with code ${code}`);
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

module.exports = { wrapPcmInWavHeader };
