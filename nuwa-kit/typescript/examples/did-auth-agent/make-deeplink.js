#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const bs58mod = require('bs58');
const bs58 = bs58mod.encode ? bs58mod : bs58mod.default;

const pubPem = fs.readFileSync('~/.config/nuwa-did/agent-pub.pem'.replace('~', process.env.HOME), 'utf8');
const jwk = crypto.createPublicKey(pubPem).export({ format: 'jwk' });
const raw = Buffer.from(jwk.x, 'base64url');
const publicKeyMultibase = 'z' + bs58.encode(raw);

const idFragment = process.env.ID_FRAGMENT || 'agent-auth-1';
const redirectUri = process.env.REDIRECT_URI || 'https://test-id.nuwa.dev/close';
const state = crypto.randomUUID();
const cadopDomain = process.env.CADOP_DOMAIN || 'https://test-id.nuwa.dev';

const payload = {
  version: 1,
  verificationMethod: {
    type: 'Ed25519VerificationKey2020',
    publicKeyMultibase,
    idFragment,
  },
  verificationRelationships: ['authentication'],
  redirectUri,
  state,
};

const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
const deepLinkUrl = `${cadopDomain.replace(/\/+$/, '')}/add-key?payload=${encodedPayload}`;

console.log('Deep link URL:');
console.log(deepLinkUrl);
console.log('\nPayload:', JSON.stringify(payload, null, 2));
