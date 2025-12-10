// Setup global.crypto for Node.js test environment
const { webcrypto } = require('node:crypto');

// Make crypto available as a global
if (!global.crypto) {
  global.crypto = webcrypto;
}
