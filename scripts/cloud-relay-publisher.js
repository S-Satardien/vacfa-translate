/**
 * VACFA Translate — Cloud SSE Relay Publisher (Multi-Device Broadcast Bridge)
 *
 * Connects as a read-only WebSocket client to the running local bot (`ws://127.0.0.1:9876`)
 * and mirrors every finalized translated caption payload via HTTPS POST to the session's
 * `ntfy.sh` SSE topic so remote colleagues on GitHub Pages receive live captions & TTS audio
 * without needing localhost access.
 */

const WebSocket = require('ws');

const RELAY_WS_URL = process.env.LOCAL_RELAY_WS || 'ws://127.0.0.1:9876';
const SESSION_SLOT = (process.argv[2] || process.env.SESSION_SLOT || 'session-009').replace(/[^a-zA-Z0-9_-]/g, '');
const CLOUD_TOPIC = `vacfa-translate-live-9f4a2c-${SESSION_SLOT}`;
const PUBLISH_URL = `https://ntfy.sh/${CLOUD_TOPIC}`;

const logger = {
  /**
   * Logs an operational info message.
   * @param {string} msg - Message text
   */
  info(msg) {
    process.stdout.write(`${new Date().toISOString()} [INFO] [CloudRelay] ${msg}\n`);
  },
  /**
   * Logs a recoverable warning.
   * @param {string} msg - Warning text
   */
  warn(msg) {
    process.stderr.write(`${new Date().toISOString()} [WARN] [CloudRelay] ${msg}\n`);
  },
};

/**
 * Publishes a serialized caption event JSON payload to the HTTPS SSE relay topic.
 * @param {string} rawJson - Serialized JSON message from the local bot relay
 * @returns {Promise<void>}
 */
async function publishToCloud(rawJson) {
  try {
    const res = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: rawJson,
    });
    if (!res.ok) {
      logger.warn(`Cloud publish returned HTTP ${res.status}`);
    }
  } catch (err) {
    logger.warn(`Cloud publish error: ${err.message}`);
  }
}

/**
 * Maintains a persistent WebSocket listener to `ws://127.0.0.1:9876` and forwards
 * live captions to remote colleague browsers via `PUBLISH_URL`.
 */
function connectLocalRelay() {
  logger.info(`Connecting to local relay ${RELAY_WS_URL} -> Cloud topic ${PUBLISH_URL}`);
  const ws = new WebSocket(RELAY_WS_URL);
  let forwarded = 0;

  ws.on('open', () => {
    logger.info(`Connected! Broadcasting live captions for "${SESSION_SLOT}" to all remote colleagues.`);
  });

  ws.on('message', (data) => {
    const raw = data.toString();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type === 'caption') {
        forwarded++;
        publishToCloud(raw);
        if (forwarded <= 5 || forwarded % 10 === 0) {
          logger.info(`Forwarded live caption #${forwarded} to cloud (${parsed.caption?.speaker || 'Speaker'})`);
        }
      }
    } catch {}
  });

  ws.on('close', () => {
    logger.warn('Local relay disconnected — retrying in 3s...');
    setTimeout(connectLocalRelay, 3000);
  });

  ws.on('error', (err) => {
    logger.warn(`Local relay error: ${err.message}`);
  });
}

if (require.main === module) {
  connectLocalRelay();
}

module.exports = { publishToCloud, CLOUD_TOPIC };
