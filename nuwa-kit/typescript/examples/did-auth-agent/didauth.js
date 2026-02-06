#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const { parseArgs } = require('util');

const args = parseArgs({
  options: {
    did: { type: 'string', required: true },
    key: { type: 'string', required: true }, // PEM private key
    keyId: { type: 'string', default: '' },  // optional fragment
    aud: { type: 'string', required: true }, // audience / base url
    method: { type: 'string', required: true },
    path: { type: 'string', required: true },
    body: { type: 'string', default: '' },
  },
});

const did = args.values.did;
const keyId = args.values.keyId || `${did}#key-1`;
const bodyHash = crypto.createHash('sha256').update(args.values.body).digest('hex');

// Pure Node path: no external deps
function canonicalize(obj) {
  const keys = Object.keys(obj).sort();
  return JSON.stringify(obj, keys);
}

const signed_data = {
  operation: 'http_request',
  params: {
    method: args.values.method.toUpperCase(),
    path: args.values.path,
    body_hash: bodyHash,
    audience: args.values.aud,
  },
  nonce: crypto.randomUUID(),
  timestamp: Math.floor(Date.now() / 1000),
};

const dataToSign = Buffer.from('DIDAuthV1:' + canonicalize(signed_data));
const sigBytes = crypto.sign(null, dataToSign, {
  key: fs.readFileSync(args.values.key, 'utf8'),
  dsaEncoding: 'ieee-p1363',
});

const signedObj = {
  signed_data,
  signature: {
    signer_did: did,
    key_id: keyId,
    value: sigBytes.toString('base64url'),
  },
};

const header = `DIDAuthV1 u${Buffer.from(JSON.stringify(signedObj)).toString('base64url')}`;
console.log(header);
