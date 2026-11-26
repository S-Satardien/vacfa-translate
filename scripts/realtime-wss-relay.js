/**
 * VACFA Translate — Zero-Cost Persistent WebSocket Pub/Sub Relay (Node.js Publisher)
 *
 * Uses lightweight MQTT 3.1.1 over persistent WSS (`wss://`) with dual-broker redundancy
 * (`broker.emqx.io:8084` + `test.mosquitto.org:8081`) so remote colleagues receive live
 * sliding-window drafts (`caption_draft`), finalized captions (`caption`), noise rollbacks
 * (`caption_remove`), and retained catch-up history (`retain=true`) with ~180ms RTT,
 * $0/month cost, zero accounts, and zero 250-message/day rate limits.
 */

const WebSocket = require('ws');

const DEFAULT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081',
];

const TOPIC_PREFIX = 'vacfa/rt/9f4a2c7e';

const logger = {
  /**
   * Logs an informational relay event.
   * @param {string} msg - Log message
   */
  info(msg) {
    process.stdout.write(`${new Date().toISOString()} [INFO] [RealtimeWSS] ${msg}\n`);
  },
  /**
   * Logs a warning or recoverable connection issue.
   * @param {string} msg - Warning message
   */
  warn(msg) {
    process.stderr.write(`${new Date().toISOString()} [WARN] [RealtimeWSS] ${msg}\n`);
  },
};

/**
 * Encodes an MQTT 3.1.1 Variable Byte Integer remaining length field.
 * @param {number} length - Byte length
 * @returns {Buffer}
 */
function encodeRemainingLength(length) {
  const bytes = [];
  let x = length;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encodedByte |= 128;
    bytes.push(encodedByte);
  } while (x > 0);
  return Buffer.from(bytes);
}

/**
 * Encodes a length-prefixed UTF-8 string per MQTT 3.1.1 specification.
 * @param {string} value - String to encode
 * @returns {Buffer}
 */
function encodeUtf8String(value) {
  const buf = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

/**
 * Builds an MQTT 3.1.1 CONNECT packet (Clean Session, 30s Keep-Alive).
 * @param {string} clientId - Unique client identifier
 * @returns {Buffer}
 */
function buildConnectPacket(clientId) {
  const variableHeader = Buffer.from([
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // Protocol Name "MQTT"
    0x04, // Protocol Level 4 (MQTT 3.1.1)
    0x02, // Connect Flags: Clean Session
    0x00, 0x1e, // Keep Alive: 30 seconds
  ]);
  const payload = encodeUtf8String(clientId);
  const remaining = encodeRemainingLength(variableHeader.length + payload.length);
  return Buffer.concat([Buffer.from([0x10]), remaining, variableHeader, payload]);
}

/**
 * Builds an MQTT 3.1.1 QoS-0 PUBLISH packet with optional RETAIN flag.
 * @param {string} topic - Target topic string
 * @param {string} message - UTF-8 JSON payload
 * @param {boolean} [retain=false] - Whether broker should retain message for late joiners
 * @returns {Buffer}
 */
function buildPublishPacket(topic, message, retain = false) {
  const headerByte = retain ? 0x31 : 0x30;
  const variableHeader = encodeUtf8String(topic);
  const payload = Buffer.from(message, 'utf8');
  const remaining = encodeRemainingLength(variableHeader.length + payload.length);
  return Buffer.concat([Buffer.from([headerByte]), remaining, variableHeader, payload]);
}

const PINGREQ_PACKET = Buffer.from([0xc0, 0x00]);

/**
 * Creates a persistent dual-broker WSS publisher for a VACFA live session slot.
 * Keeps long-lived WebSocket connections open to all configured brokers for zero-SPOF failover.
 *
 * @param {object} options - Publisher options
 * @param {string} [options.slot='session-009'] - Session slot identifier
 * @param {string[]} [options.brokers] - List of WSS broker URLs
 * @returns {{ publishLive: (payload: object) => void, publishHistory: (captions: Array<object>) => void, stop: () => void, isConnected: () => boolean }}
 */
function createRealtimeWssPublisher({ slot = 'session-009', brokers = DEFAULT_BROKERS } = {}) {
  const safeSlot = String(slot || 'session-009').replace(/[^a-zA-Z0-9_-]/g, '');
  const liveTopic = `${TOPIC_PREFIX}/${safeSlot}/live`;
  const historyTopic = `${TOPIC_PREFIX}/${safeSlot}/history`;

  let stopped = false;
  let lastHistoryJson = '';
  const links = new Map();

  function connectBroker(url) {
    if (stopped) return;

    const state = {
      url,
      ws: null,
      ready: false,
      pingTimer: null,
      reconnectTimer: null,
    };
    links.set(url, state);

    const openSocket = () => {
      if (stopped) return;
      state.ready = false;

      try {
        const ws = new WebSocket(url, ['mqtt'], { handshakeTimeout: 6000 });
        state.ws = ws;

        ws.on('open', () => {
          const clientId = `vacfa-pub-${safeSlot}-${Math.random().toString(36).slice(2, 8)}`;
          ws.send(buildConnectPacket(clientId));
        });

        ws.on('message', (data) => {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          if (buf.length >= 2 && (buf[0] >> 4) === 2) {
            // CONNACK received — persistent channel is ready for zero-latency publishing
            state.ready = true;
            logger.info(`Connected to persistent WSS broker: ${url} (topic: ${liveTopic})`);

            if (lastHistoryJson) {
              try {
                ws.send(buildPublishPacket(historyTopic, lastHistoryJson, true));
              } catch {}
            }

            if (state.pingTimer) clearInterval(state.pingTimer);
            state.pingTimer = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(PINGREQ_PACKET); } catch {}
              }
            }, 24000);
          }
        });

        ws.on('close', () => {
          state.ready = false;
          if (state.pingTimer) {
            clearInterval(state.pingTimer);
            state.pingTimer = null;
          }
          if (!stopped) {
            state.reconnectTimer = setTimeout(openSocket, 4000);
          }
        });

        ws.on('error', (err) => {
          state.ready = false;
          logger.warn(`Broker ${url} error: ${err.message}`);
        });
      } catch (err) {
        logger.warn(`Broker ${url} init failed: ${err.message}`);
        if (!stopped) {
          state.reconnectTimer = setTimeout(openSocket, 5000);
        }
      }
    };

    openSocket();
  }

  for (const url of brokers) {
    connectBroker(url);
  }

  const sendToAll = (topic, jsonString, retain = false) => {
    const pkt = buildPublishPacket(topic, jsonString, retain);
    for (const state of links.values()) {
      if (state.ready && state.ws && state.ws.readyState === WebSocket.OPEN) {
        try {
          state.ws.send(pkt);
        } catch {}
      }
    }
  };

  const stop = () => {
    stopped = true;
    for (const state of links.values()) {
      if (state.pingTimer) clearInterval(state.pingTimer);
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      if (state.ws) {
        try { state.ws.close(); } catch {}
      }
    }
    links.clear();
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', stop);

  return {
    publishLive(payload) {
      if (stopped || !payload) return;
      sendToAll(liveTopic, JSON.stringify(payload), false);
    },
    publishHistory(captions) {
      if (stopped || !Array.isArray(captions)) return;
      lastHistoryJson = JSON.stringify({
        type: 'caption_history',
        captions: captions.slice(-15),
        updatedAt: Date.now(),
      });
      sendToAll(historyTopic, lastHistoryJson, true);
    },
    isConnected() {
      for (const state of links.values()) {
        if (state.ready) return true;
      }
      return false;
    },
    stop,
  };
}

module.exports = {
  createRealtimeWssPublisher,
  DEFAULT_BROKERS,
  TOPIC_PREFIX,
};
