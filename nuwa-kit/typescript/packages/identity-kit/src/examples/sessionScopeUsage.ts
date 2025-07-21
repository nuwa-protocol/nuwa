/**
 * Example usage of Session-Key Scope functionality
 * 
 * This example demonstrates how to:
 * 1. Create a DID with custom scopes
 * 2. Add verification methods with specific scopes
 * 3. Use CADOP with custom scopes
 */

import { IdentityEnv, buildBaseScopes, combineScopes, validateScopes } from '../index';
import { KeyType } from '../types/crypto';

export async function sessionScopeUsageExample() {
  // Example 1: Creating a DID with custom scopes for a DeFi application
  console.log('=== Example 1: Creating DID with DeFi application scopes ===');
  
  // Note: This is example code - actual setup would include proper registry and keyManager
  const env = {} as any; // placeholder for example
  
  // Define custom scopes for DeFi operations (only additional scopes needed)
  const defiScopes = [
    '0xabc123::defi::swap',        // Allow swap operations
    '0xabc123::defi::add_liquidity', // Allow adding liquidity
    '0xdef456::token::transfer',    // Allow token transfers
  ];

  // Validate scopes before use
  const scopeValidation = validateScopes(defiScopes);
  if (!scopeValidation.valid) {
    throw new Error(`Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`);
  }

  const didCreationRequest = {
    publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    keyType: 'Ed25519VerificationKey2020',
    customScopes: defiScopes, // SDK will automatically combine with base scopes
  };

  // Create DID - SDK combines custom scopes with base scopes automatically
  const identityKit = await env.createDid('rooch', didCreationRequest);
  console.log('Created DID with DeFi scopes + base scopes:', identityKit.getDIDDocument().id);
  
  // The actual scopes will include:
  // - 0x3::did::*  (base)
  // - 0x3::payment_channel::*  (base) 
  // - 0xabc123::defi::swap  (custom)
  // - 0xabc123::defi::add_liquidity  (custom)
  // - 0xdef456::token::transfer  (custom)
  // Note: DID account's own address scope is handled by the contract

  // Example 2: Adding a chat-specific verification method
  console.log('\n=== Example 2: Adding chat-specific verification method ===');
  
  // Define scopes for chat operations only (additional to base scopes)
  const chatScopes = [
    '0x888999::chat::send',
    '0x888999::chat::join_room',
  ];

  // Add a new verification method for chat operations with limited scope
  const chatKeyId = await identityKit.addVerificationMethod(
    {
      type: KeyType.ED25519,
      publicKeyMaterial: new Uint8Array(32), // Your actual public key bytes
      idFragment: 'chat-key',
    },
    ['authentication', 'capabilityInvocation'], // authentication triggers scope handling
    {
      scopes: chatScopes, // SDK will combine with base scopes automatically
    }
  );
  
  console.log('Added chat-specific verification method:', chatKeyId);
  console.log('This VM will have base scopes + chat scopes');

  // Example 3: CADOP with custom scopes
  console.log('\n=== Example 3: CADOP creation with custom scopes ===');
  
  // For a gaming application
  const gamingScopes = [
    '0xgame123::nft::mint',
    '0xgame123::marketplace::buy',
    '0xgame123::marketplace::sell',
    '0xreward456::token::claim',
  ];

  // Custodian creates user DID with gaming-specific permissions
  const cadopResult = await env.registry.createDIDViaCADOP('rooch', {
    userDidKey: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    custodianServicePublicKey: 'z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    custodianServiceVMType: 'Ed25519VerificationKey2020',
    customScopes: gamingScopes,
  }, {
    // custodian signer options
  });

  if (cadopResult.success) {
    console.log('Created user DID via CADOP with gaming scopes:', cadopResult.didDocument?.id);
  }

  // Example 4: Combining and analyzing scopes
  console.log('\n=== Example 4: Scope analysis and combination ===');
  
  // Get base scopes that are always included
  const baseScopes = buildBaseScopes();
  console.log('Base scopes:', baseScopes);

  // Combine with application-specific scopes
  const appScopes = ['0xapp::module::function1', '0xapp::module::function2'];
  const allScopes = combineScopes(appScopes);
  console.log('Combined scopes:', allScopes);

  // Example 5: Scope validation and error handling
  console.log('\n=== Example 5: Scope validation ===');
  
  const mixedScopes = [
    '0x3::did::*',           // valid
    'invalid-format',        // invalid
    '0xabc::defi::swap',     // valid
    '::missing::address',    // invalid
  ];

  const validation = validateScopes(mixedScopes);
  if (!validation.valid) {
    console.log('Invalid scopes found:', validation.invalidScopes);
    console.log('These scopes would be rejected by the blockchain');
  }

  console.log('\n=== Session Scope Usage Examples Complete ===');
}

// Helper function to demonstrate scope-based permission checking
export function checkScopePermissions(userScopes: string[], requiredScope: string): boolean {
  // Check if user has the exact scope or a wildcard that covers it
  return userScopes.some(scope => {
    if (scope === requiredScope) {
      return true; // exact match
    }
    
    // Check for wildcard matches
    const [scopeAddr, scopeModule, scopeFunc] = scope.split('::');
    const [reqAddr, reqModule, reqFunc] = requiredScope.split('::');
    
    // Address must match (or be wildcard)
    if (scopeAddr !== '*' && scopeAddr !== reqAddr) {
      return false;
    }
    
    // Module must match (or be wildcard)
    if (scopeModule !== '*' && scopeModule !== reqModule) {
      return false;
    }
    
    // Function must match (or be wildcard)
    if (scopeFunc !== '*' && scopeFunc !== reqFunc) {
      return false;
    }
    
    return true;
  });
}

// Example of how applications might check permissions
export function applicationPermissionExample() {
  const userScopes = [
    '0x3::did::*',                    // can call any DID function
    '0x3::payment_channel::*',        // can call any payment function
    'rooch1user123::*::*',            // can call any function on their account
    '0xdefi::swap::execute',          // can execute swaps
    '0xdefi::pool::*',                // can call any pool function
  ];

  // Check specific permissions
  console.log('Can execute swap?', 
    checkScopePermissions(userScopes, '0xdefi::swap::execute')); // true
  
  console.log('Can add liquidity?', 
    checkScopePermissions(userScopes, '0xdefi::pool::add_liquidity')); // true
  
  console.log('Can mint NFT?', 
    checkScopePermissions(userScopes, '0xnft::mint::create')); // false
  
  console.log('Can manage DID?', 
    checkScopePermissions(userScopes, '0x3::did::add_verification_method')); // true
} 