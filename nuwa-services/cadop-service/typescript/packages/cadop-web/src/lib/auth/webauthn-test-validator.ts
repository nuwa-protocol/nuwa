import { p256 } from '@noble/curves/p256';

/**
 * WebAuthn Test Data Validator
 * 
 * This script validates WebAuthn signature data consistency between frontend and Move contract.
 * Use this to verify that the data logged by WebAuthnSigner.ts is correct before filling
 * the Move test case.
 */

interface WebAuthnTestData {
  authenticatorDataHex: string;
  clientDataJSONHex: string;
  signatureRawHex: string;      // 64 bytes raw signature (already converted from DER)
  publicKeyCompressedHex: string;
  clientDataHashHex: string;
  verificationMessageHex: string;
  bcsPayloadHex: string;
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate WebAuthn test data consistency
 */
export async function validateWebAuthnTestData(data: WebAuthnTestData): Promise<{
  isValid: boolean;
  errors: string[];
  details: Record<string, any>;
}> {
  const errors: string[] = [];
  const details: Record<string, any> = {};

  try {
    // Parse hex data
    const authenticatorData = hexToBytes(data.authenticatorDataHex);
    const clientDataJSON = hexToBytes(data.clientDataJSONHex);
    const signatureRaw = hexToBytes(data.signatureRawHex);
    const publicKey = hexToBytes(data.publicKeyCompressedHex);
    const expectedClientDataHash = hexToBytes(data.clientDataHashHex);
    const expectedVerificationMessage = hexToBytes(data.verificationMessageHex);

    details.dataLengths = {
      authenticatorData: authenticatorData.length,
      clientDataJSON: clientDataJSON.length,
      signatureRaw: signatureRaw.length,
      publicKey: publicKey.length,
    };

    // 1. Validate data lengths
    if (signatureRaw.length !== 64) {
      errors.push(`Raw signature must be 64 bytes, got ${signatureRaw.length}`);
    }
    if (publicKey.length !== 33) {
      errors.push(`Compressed public key must be 33 bytes, got ${publicKey.length}`);
    }
    if (publicKey[0] !== 0x02 && publicKey[0] !== 0x03) {
      errors.push(`Invalid public key compression prefix: 0x${publicKey[0].toString(16)}`);
    }

    // 2. Validate client data hash (using Web Crypto API)
    const computedClientDataHashBuffer = await crypto.subtle.digest('SHA-256', clientDataJSON);
    const computedClientDataHash = new Uint8Array(computedClientDataHashBuffer);
    if (bytesToHex(computedClientDataHash) !== bytesToHex(expectedClientDataHash)) {
      errors.push('Client data hash mismatch');
      details.clientDataHash = {
        expected: bytesToHex(expectedClientDataHash),
        computed: bytesToHex(computedClientDataHash),
      };
    }

    // 3. Validate verification message construction
    const computedVerificationMessage = new Uint8Array(authenticatorData.length + computedClientDataHash.length);
    computedVerificationMessage.set(authenticatorData, 0);
    computedVerificationMessage.set(computedClientDataHash, authenticatorData.length);
    
    if (bytesToHex(computedVerificationMessage) !== bytesToHex(expectedVerificationMessage)) {
      errors.push('Verification message construction mismatch');
      details.verificationMessage = {
        expected: bytesToHex(expectedVerificationMessage),
        computed: bytesToHex(computedVerificationMessage),
      };
    }

    // 4. Validate ECDSA-R1 signature
    try {
      const uncompressedPublicKey = p256.ProjectivePoint
        .fromHex(publicKey)
        .toRawBytes(false); // 65 bytes uncompressed format
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', computedVerificationMessage));
      const isValidSignature = p256.verify(signatureRaw, digest, uncompressedPublicKey);
      details.signatureVerification = {
        isValid: isValidSignature,
        publicKeyUncompressed: bytesToHex(uncompressedPublicKey),
        signatureRawUsed: bytesToHex(signatureRaw),
        verificationMessageUsed: bytesToHex(computedVerificationMessage),
      };
      
      if (!isValidSignature) {
        errors.push('ECDSA-R1 signature verification failed');
      }
    } catch (error) {
      errors.push(`ECDSA-R1 verification error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 5. Log Move test data format
    if (errors.length === 0) {
      console.log('\n=== Move Test Data (Ready to use) ===');
      console.log(`authenticator_data_hex: b"${data.authenticatorDataHex}",`);
      console.log(`client_data_json_hex: b"${data.clientDataJSONHex}",`);
      console.log(`signature_raw_hex: b"${data.signatureRawHex}",`);
      console.log(`public_key_compressed_hex: b"${data.publicKeyCompressedHex}",`);
      console.log(`client_data_hash_hex: b"${data.clientDataHashHex}",`);
      console.log(`verification_message_hex: b"${data.verificationMessageHex}",`);
      console.log('=== End Move Test Data ===\n');
    }

    // 6. Additional WebCrypto verification
    //if (errors.length === 0) {
      const webCryptoVerificationResult = await verifyWebCrypto(data);
      if (!webCryptoVerificationResult.isValid) {
        errors.push(...webCryptoVerificationResult.errors);
        details.webCryptoVerification = webCryptoVerificationResult.details;
      }
    //}

    return {
      isValid: errors.length === 0,
      errors,
      details,
    };

  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      isValid: false,
      errors,
      details,
    };
  }
}

// ===== WebCrypto verification helper =====
async function verifyWebCrypto(data: WebAuthnTestData): Promise<{isValid:boolean; errors:string[]; details:any}> {
  const errors: string[] = [];
  const details: Record<string, any> = {};
  try {
    const msg = hexToBytes(data.verificationMessageHex);
    const sigRaw = hexToBytes(data.signatureRawHex);
    const pkCompressed = hexToBytes(data.publicKeyCompressedHex);
    // convert pk to uncompressed for WebCrypto
    const pkUncompressed = p256.ProjectivePoint.fromHex(pkCompressed).toRawBytes(false);
    // raw->DER
    const derSig = p256.Signature.fromCompact(sigRaw).toDERRawBytes();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      pkUncompressed,
      {name:'ECDSA', namedCurve:'P-256'},
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify({name:'ECDSA', hash:{name:'SHA-256'}}, cryptoKey, derSig, msg);
    details.ok = ok;
    // --- Additional debug info ---
    details.msg_hex = bytesToHex(msg);
    details.sig_raw_hex = data.signatureRawHex;
    details.sig_der_hex = bytesToHex(derSig);
    details.pk_uncompressed_hex = bytesToHex(pkUncompressed);
    // -----------------------------
    if(!ok){
      errors.push('WebCrypto verification failed');
    }
  }catch(e){
    errors.push(`WebCrypto error: ${e instanceof Error?e.message:String(e)}`);
  }
  return {isValid: errors.length===0, errors, details};
}

/**
 * Example usage with placeholder data
 */
export async function runExampleValidation() {
  const exampleData: WebAuthnTestData = {
    // Replace these with actual data from WebAuthnSigner.ts logs
    authenticatorDataHex: "49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000",
    clientDataJSONHex: "7b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a2277416d626e544f6d493153735a64715864764969484d7a487278695f4e376e512d7246795036626a495841222c226f726967696e223a22687474703a2f2f6c6f63616c686f73743a33303030222c2263726f73734f726967696e223a66616c73652c226f746865725f6b6579735f63616e5f62655f61646465645f68657265223a22646f206e6f7420636f6d7061726520636c69656e74446174614a534f4e20616761696e737420612074656d706c6174652e205365652068747470733a2f2f676f6f2e676c2f796162506578227d",
    signatureRawHex: "2cb68340c06cce07bb3fbb5df30ac92dec559dc1fa22ebb770456a9778437b4a278102b8be5dc361e90cee9f0a6a214750c007e65a2f96cd947b5f9c0a44cd30",
    publicKeyCompressedHex: "03faabaa02f39bae7cf872cbaf009ca1676ed0ced644d991a91f293bc4ccf7c1f5",
    clientDataHashHex: "ad59f6d421a489c1570f4111cc2ba6cfc8b001de518ae2db6adf92fdfc482bd8",
    verificationMessageHex: "49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000ad59f6d421a489c1570f4111cc2ba6cfc8b001de518ae2db6adf92fdfc482bd8",
    bcsPayloadHex: "00402cb68340c06cce07bb3fbb5df30ac92dec559dc1fa22ebb770456a9778437b4a278102b8be5dc361e90cee9f0a6a214750c007e65a2f96cd947b5f9c0a44cd302103faabaa02f39bae7cf872cbaf009ca1676ed0ced644d991a91f293bc4ccf7c1f52549960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000f3017b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a2277416d626e544f6d493153735a64715864764969484d7a487278695f4e376e512d7246795036626a495841222c226f726967696e223a22687474703a2f2f6c6f63616c686f73743a33303030222c2263726f73734f726967696e223a66616c73652c226f746865725f6b6579735f63616e5f62655f61646465645f68657265223a22646f206e6f7420636f6d7061726520636c69656e74446174614a534f4e20616761696e737420612074656d706c6174652e205365652068747470733a2f2f676f6f2e676c2f796162506578227d",
  };

  console.log('WebAuthn Test Data Validator');
  console.log('=============================');
  
  if (exampleData.authenticatorDataHex.startsWith('PLACEHOLDER')) {
    console.log('⚠️  Please replace placeholder data with actual values from WebAuthnSigner.ts logs');
    return;
  }

  const result = await validateWebAuthnTestData(exampleData);
  
  if (result.isValid) {
    console.log('✅ All validations passed! Data is ready for Move test case.');
  } else {
    console.log('❌ Validation failed:');
    result.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (Object.keys(result.details).length > 0) {
    console.log('\nDetails:', JSON.stringify(result.details, null, 2));
  }

  // Additional debug information
  console.log('\n=== Debug Information ===');
  console.log('Client Data JSON (decoded):', new TextDecoder().decode(hexToBytes(exampleData.clientDataJSONHex)));
  
  // Check if the verification steps match
  const authenticatorData = hexToBytes(exampleData.authenticatorDataHex);
  const clientDataJSON = hexToBytes(exampleData.clientDataJSONHex);
  
  const actualHashBuffer = await crypto.subtle.digest('SHA-256', clientDataJSON);
  const actualHash = new Uint8Array(actualHashBuffer);
  
  const actualVerificationMessage = new Uint8Array(authenticatorData.length + actualHash.length);
  actualVerificationMessage.set(authenticatorData, 0);
  actualVerificationMessage.set(actualHash, authenticatorData.length);
  
  console.log('Expected verification message:', exampleData.verificationMessageHex);
  console.log('Computed verification message:', bytesToHex(actualVerificationMessage));
  console.log('Verification messages match:', exampleData.verificationMessageHex === bytesToHex(actualVerificationMessage));
}

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExampleValidation();
}