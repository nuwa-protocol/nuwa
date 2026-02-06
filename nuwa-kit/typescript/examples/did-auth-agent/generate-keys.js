const { generateKeyPairSync } = require('crypto');
const { writeFileSync } = require('fs');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

writeFileSync('agent-key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
writeFileSync('agent-pub.pem', publicKey.export({ type: 'spki', format: 'pem' }));

console.log('generated agent-key.pem & agent-pub.pem');
