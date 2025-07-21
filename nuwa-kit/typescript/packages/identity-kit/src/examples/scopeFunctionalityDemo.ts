/**
 * Demonstration of complete Session-Key Scope functionality
 * Shows the integration between SDK scope management and contract calls
 */

import { combineScopes, validateScopes } from '../utils/sessionScopes';

export function demonstrateScopeFeatures() {
  console.log('=== Session-Key Scope Functionality Demo ===\n');

  // 1. Basic scope building
  console.log('1. Base Scopes:');
  const baseScopes = combineScopes([]);
  console.log('   Base scopes automatically included:', baseScopes);
  console.log('   - DID management: 0x3::did::*');
  console.log('   - Payment functions: 0x3::payment_channel::*');
  console.log('   - Account-specific scopes handled by contract\n');

  // 2. Custom scope combination
  console.log('2. Custom Scope Combination:');
  const appScopes = [
    '0xdefi::swap::execute',
    '0xdefi::pool::add_liquidity',
    '0xchat::room::join',
    '0x3::did::*', // duplicate - will be removed
  ];
  
  const combinedScopes = combineScopes(appScopes);
  console.log('   Input custom scopes:', appScopes);
  console.log('   Combined result:', combinedScopes);
  console.log('   Note: Duplicates automatically removed\n');

  // 3. Scope validation
  console.log('3. Scope Validation:');
  const validScopes = ['0x123::module::function', '0xabc::*::*'];
  const invalidScopes = ['invalid-format', '0x123::module', '::empty::address'];
  const mixedScopes = [...validScopes, ...invalidScopes];

  const validation = validateScopes(mixedScopes);
  console.log('   Mixed scopes:', mixedScopes);
  console.log('   Validation result:', validation);
  console.log('   Valid:', validation.valid);
  console.log('   Invalid scopes:', validation.invalidScopes, '\n');

  // 4. Contract integration scenarios
  console.log('4. Contract Integration Scenarios:');
  
  console.log('   a) DID Creation:');
  console.log('      - SDK calls: create_did_object_for_self_with_custom_scopes_entry');
  console.log('      - Passes: combineScopes(customScopes)');
  console.log('      - Result: Base scopes + custom scopes\n');
  
  console.log('   b) CADOP Creation:');
  console.log('      - SDK calls: create_did_object_via_cadop_with_did_key_and_scopes_entry');
  console.log('      - Passes: combineScopes(customScopes)');
  console.log('      - Result: Base scopes + custom scopes\n');
  
  console.log('   c) Add Verification Method (with authentication):');
  console.log('      - SDK calls: add_verification_method_with_scopes_entry');
  console.log('      - Passes: combineScopes(options.scopes)');
  console.log('      - Result: Session-Key with combined scopes\n');
  
  console.log('   d) Add Verification Method (without authentication):');
  console.log('      - SDK calls: add_verification_method_entry');
  console.log('      - No scope handling needed\n');

  // 5. Real-world example
  console.log('5. Real-world DeFi + Gaming Example:');
  const realWorldScopes = [
    '0xdefi123::dex::swap',           // DeFi: token swapping
    '0xdefi123::lending::deposit',    // DeFi: lending protocol
    '0xgame456::nft::mint',           // Gaming: NFT minting
    '0xgame456::marketplace::buy',    // Gaming: marketplace
    '0xsocial789::chat::send',        // Social: messaging
  ];
  
  const finalScopes = combineScopes(realWorldScopes);
  console.log('   Application scopes:', realWorldScopes);
  console.log('   Final scopes for Session-Key:', finalScopes);
  console.log('   Total scope count:', finalScopes.length);
  
  console.log('\n=== Demo Complete ===');
}

// Example of runtime usage
export async function exampleUsagePatterns() {
  console.log('\n=== Usage Patterns ===');
  
  // Pattern 1: Validate before creation
  const userScopes = ['0xapp::feature::use'];
  const validation = validateScopes(userScopes);
  
  if (validation.valid) {
    const scopesForContract = combineScopes(userScopes);
    console.log('✅ Scopes validated, ready for contract:', scopesForContract);
  } else {
    console.log('❌ Invalid scopes detected:', validation.invalidScopes);
    return;
  }
  
  // Pattern 2: Different scope sets for different purposes
  const adminScopes = combineScopes([
    '0xapp::admin::*',
    '0xapp::config::*',
  ]);
  
  const userOnlyScopes = combineScopes([
    '0xapp::user::read',
    '0xapp::user::interact',
  ]);
  
  const readOnlyScopes = combineScopes([
    '0xapp::data::read',
  ]);
  
  console.log('Admin VM scopes:', adminScopes);
  console.log('User VM scopes:', userOnlyScopes);
  console.log('Read-only VM scopes:', readOnlyScopes);
}

// Run demonstrations if this file is executed directly
if (require.main === module) {
  demonstrateScopeFeatures();
  exampleUsagePatterns();
} 