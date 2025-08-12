---
nip: 1
title: Agent Single DID Multi-Key Model
author: jolestar(@jolestar)
discussions-to: https://github.com/nuwa-protocol/NIPs/discussions/3
status: Draft
type: Standards Track
category: Core
created: 2024-05-12
updated: 2025-07-07
---

## Abstract

This NIP proposes a foundational decentralized identity model for Agents (representing users, services, or other autonomous entities) within the ecosystem. It enables a single master Decentralized Identifier (DID) to manage multiple operational keys (e.g., device-specific keys, application-specific keys, or service instance keys). The model aims to ensure consistent and verifiable identities, key isolation, permission control, and secure revocability across multiple devices and application contexts. The model supports various DID methods (which could be anchored to different Verifiable Data Registries, including blockchains) presented as potential examples for anchoring DID documents.

## Motivation

To establish a consistent and secure identity framework for all participating entities (Agents, including users and service providers) within the ecosystem, a standardized approach to DID management is needed. This NIP defines a decentralized identity model based on a **"single master identity + multiple operational sub-keys"** concept. This allows an Agent, whether an end-user managing multiple devices and applications, or a service provider managing different operational instances or keys, to operate under a unified DID. It aims to provide a robust and flexible identity foundation for Agents in the ecosystem, enabling secure interactions and verifiable claims without compromising core digital identities or creating identity fragmentation across various devices and application environments.

## Specification

### Core Design Principles

-   **Single Master Identity**: Each Agent possesses a master DID (e.g., any DID compliant with W3C DID specifications, such as `did:example:123`; for implementations on a specific network, like `did:<method>:<entity1>`), representing their unique digital persona or service identity and associated digital assets/memories/configurations. Control over this DID is held by one or more Master Key(s).
-   **Multi-Device/Application/Operational Keys**: Each Agent instance or distinct operational context (e.g., a specific device, a specific application instance on a device, a service replica, a temporary session) generates or is assigned a local Key (referred to broadly as an "Operational Key" or sometimes "Device Key" or "Application Key" in examples for simplicity, but can represent any operational sub-key).
-   **DID Document Registration**: The public key information of each such Key is registered as a `verificationMethod` entry in the DID document associated with the master DID.
-   **Fine-grained Verification Relationships**: By adding the `id` of a `verificationMethod` to different verification relationships (e.g., `authentication`, `assertionMethod`, `capabilityInvocation`, `capabilityDelegation`), the permission scope of each key can be precisely controlled.
-   **Signatures Indicate Origin**: All signature operations initiated by an Agent using one of its keys must clearly indicate which key was used (via the `id` of the `verificationMethod`).
-   **Passkey Boot-strap**: In scenarios where a traditional crypto wallet is not initially present, an Agent MAY begin its lifecycle with a DID based on the `did:key` method, where the key material is derived from a WebAuthn Passkey. This initial key SHOULD be listed in both the `authentication` and `capabilityDelegation` verification relationships of the `did:key` document, granting the user full control from inception.

It is important to distinguish between a `verificationMethod` entry and a verification relationship. A `verificationMethod` entry primarily describes key material (e.g., the public key and its type). The verification relationship arrays (such as `authentication`, `assertionMethod`, `capabilityInvocation`, `capabilityDelegation`) declare the *purpose* or authorized uses of a specific key, referencing the `id` of a `verificationMethod` entry.

To further clarify the common verification relationships used in DID documents (as defined in the W3C DID Core specification) and their relevance within this NIP and related protocols (like CADOP):

*   **`authentication`**:
    *   **Purpose**: Specifies how the DID subject can be authenticated. A `verificationMethod` listed under `authentication` is used to prove that the DID subject is performing an action under their control. Examples include signing a message to log into a service, establishing a secure session, or authorizing operations such as sending messages or initiating general on-chain transactions from an account associated with the DID.
    *   **Relevance in NIP-1/CADOP**: Crucial for Agent login, session establishment, and authorizing operations. In the CADOP context, the user's initial key (e.g., from a Passkey) is placed in `authentication` (and `capabilityDelegation`) to grant them control.

*   **`assertionMethod`**:
    *   **Purpose**: Specifies how the DID subject can make verifiable assertions, such as issuing Verifiable Credentials. A `verificationMethod` listed here is authorized to sign credentials or other statements on behalf of the DID subject.
    *   **Relevance in NIP-1/CADOP**: Enables Agents (users or services) to issue claims or credentials about themselves or other entities, forming a basis for trust and verifiable data exchange.

*   **`keyAgreement`**:
    *   **Purpose**: Specifies how an entity can establish secure encrypted communication channels with the DID subject. Keys listed here are typically used for cryptographic key exchange protocols (e.g., Diffie-Hellman).
    *   **Relevance in NIP-1/CADOP**: Useful for establishing encrypted communication between Agents or between an Agent and a service. While not explicitly detailed in all NIP-1 examples, its inclusion here is for completeness regarding standard DID capabilities.

*   **`capabilityInvocation`**:
    *   **Purpose**: Specifies how the DID subject can invoke capabilities or perform actions, such as interacting with a service endpoint or operating on a resource. A `verificationMethod` listed here authorizes the key to make such invocations, essentially acting on behalf of the DID subject for specific operations.
    *   **Relevance in NIP-1/CADOP**: Essential for authorizing operational keys to interact with services declared in the DID document. For example, a Custodian's service key, when listed in a user's DID document under `capabilityInvocation`, is authorized to call its own service endpoint in the context of that user (as per CADOP). This relationship is also used to authorize keys for managing the `service` entries themselves, as per NIP-1 permission rules.

*   **`capabilityDelegation`**:
    *   **Purpose**: Specifies how the DID subject can delegate its capabilities to another entity or key. A `verificationMethod` listed here is authorized to grant capabilities to other keys or DIDs. This relationship signifies a higher level of authority, often including the ability to manage other verification methods and their relationships within the DID document.
    *   **Relevance in NIP-1/CADOP**: This represents the highest level of control over the DID. It is typically held by the DID's Master Key(s) or, in the CADOP user-centric model, by the user's primary controlling key (e.g., derived from a Passkey). This permission is required for managing keys, updating any verification relationship (including `capabilityDelegation` itself), and, under standard NIP-1 rules, for changing the DID `controller`.

These verification relationships are fundamental for defining the security model and operational semantics of a DID, dictating what actions are permissible with different cryptographic keys associated with the DID.

### General DID Method Support and Considerations for Advanced Functionality

This Agent model is designed to be compatible with any W3C compliant DID method. An Agent's master DID can, in principle, adopt any such method (e.g., `did:key`, `did:web`, `did:ethr`, `did:ion`). The choice of DID method determines how and where the DID document is stored and managed (i.e., the Verifiable Data Registry or VDR).

Crucially, for an Agent to support advanced on-chain functionalities such as payments, state channel creation (e.g., as detailed in NIP-4), or other direct blockchain interactions, its chosen DID method must be one that is anchored to a blockchain (i.e., an "on-chain DID"). This implies that the DID is associated with a specific on-chain account or address that can receive funds, initiate transactions, and interact with smart contracts necessary for these functionalities. The specific on-chain address to be used for a particular interaction (like a payment channel) would then be discoverable or communicated as part of the relevant protocol (e.g., within NIP-4 messages).

However, for these advanced functionalities within the ecosystem, such as on-chain interactions including payments (e.g., as might be detailed in NIP-4 for state channels) or other forms of direct blockchain engagement by an Agent, the underlying VDR (the blockchain to which the on-chain DID is anchored) associated with the chosen DID method (or at least the VDR used for operational keys involved in such transactions) must meet specific requirements:

-   **Transaction Authorization by Operational Keys**: The VDR and its associated transaction system must allow operational keys (sub-keys registered in the Agent's DID document as `verificationMethod` entries) to authorize and initiate transactions on behalf of the Agent's primary on-chain identity or account. This is crucial for enabling an Agent to act through its various operational contexts (devices, services) without directly using its master key(s) for every transaction.
-   **Account Abstraction or Similar Capabilities**: To facilitate the above, the underlying blockchain might need to support concepts like account abstraction. This allows an Agent's on-chain account to be controlled by logic that can recognize and authorize actions initiated by its registered operational keys, rather than solely by a single private key tied directly to the account. This enables an Agent to delegate specific on-chain permissions to different operational keys, enhancing security and flexibility.
-   **Smart Contract Interaction**: The VDR should support the execution of smart contracts if on-chain logic is required for managing DID-related operations, permissions, or interactions with other ecosystem protocols that rely on smart contracts (e.g., state channels, registries).

Therefore, while NIP-1 provides a flexible identity superstructure, the practical choice of DID methods and their underlying VDRs for Agents participating in advanced on-chain operations will be influenced by the technical capabilities of those VDRs to support the required transactional semantics and key management models. Implementers should evaluate VDR capabilities when designing solutions that leverage this NIP for on-chain activities.

### Master Key Management & Recovery

Secure management and reliable recovery of master keys are critical.
-   **Master Key(s)**: Agents must generate and securely back up their master DID's Master Key(s). For user Agents, this often means offline backup. For service Agents, this could involve secure key management systems. These private keys should not be stored on any routinely used operational devices or instances without extreme care.
-   **Controller**: The `controller` field of the DID document must point to the entity holding the Master Key(s), which is typically the DID subject itself.
-   **Recovery Mechanisms**: Robust key recovery mechanisms (e.g., Social Recovery, Multi-signature, Hardware Wallet, M-of-N schemes) are essential and depend on the adopted DID method and the Agent's nature.

### Unified Service Discovery via DID Documents

A core principle for the ecosystem is to enable simple and standardized discovery of services offered by Agents. NIP-1 establishes the use of the `service` property within a DID document as the **standard mechanism for service declaration and discovery**.

-   **Service Declaration**: Any Agent (user or service provider) that offers a service discoverable by other Agents MUST declare these services within the `service` array of its DID document.
-   **Standardized Service Types**: Each NIP that defines a specific service (e.g., a Fiat Proxy service as in NIP-5, an LLM Gateway as in NIP-9) MUST specify a unique `type` string for that service (e.g., `"FiatProxyServiceNIP5"`, `"LLMGatewayNIP9"`, `"CadopCustodianService"`, `"CadopWeb2ProofService"`, `"CadopIdPService"`). This `type` is used in the `service.type` field of the service entry.

    To ensure clarity and uniqueness, service types within this ecosystem should follow one of the following naming conventions:
    *   **For services that are integral components of a larger, named protocol (e.g., a protocol defined by a NIP or a set of NIPs)**: The service `type` should be prefixed with an abbreviation or a well-known name of the protocol, followed by the specific role of the service. Example: `CadopCustodianService`, where "Cadop" refers to the Custodian-Assisted DID Onboarding Protocol.
    *   **For services defined by a specific NIP that are more standalone or represent a specific version/instance of a general service concept**: The service `type` should combine a descriptive name of the service concept with a suffix indicating the NIP number that defines it. Example: `FiatProxyServiceNIP5`, indicating a Fiat Proxy service as defined in NIP-5.
    
    This approach ensures that service types are both descriptive and directly linkable to their defining specifications.

-   **Service-Specific Metadata**: The NIP defining the service MUST also specify the structure of any additional metadata required for that service. This metadata should be included as properties within the corresponding `service` entry in the DID document. The `serviceEndpoint` property typically defines the primary interaction endpoint for the service.
-   **Client Discovery**: Client Agents discover services by:
    1.  Obtaining the DID of a potential service provider.
    2.  Resolving the DID document associated with that DID.
    3.  Iterating through the `service` array in the DID document, looking for entries with the desired `service.type`.
    4.  Extracting the `serviceEndpoint` and other service-specific metadata to interact with the service.

This approach ensures a consistent and decentralized way for services to be announced and discovered, leveraging the existing DID infrastructure.

### DID Document Structure Example

Below is an example of a DID document conforming to this NIP. This example uses `did:example` as a placeholder for a concrete DID method.

**Key points illustrated in the example:**
*   The `id` field (e.g., `did:example:alice`) represents the Agent's unique DID. This Agent could be an end-user, a service, or another autonomous entity. The specific nature of the Agent can be further clarified by other properties within the DID document, such as the `service` property.
*   Each entry in `verificationMethod` represents an operational key.
    *   The `id` within a `verificationMethod` entry (e.g., `did:example:alice#key-1`) is a generic identifier for that specific key.
    *   The `type` (e.g., `EcdsaSecp256k1VerificationKey2019`) specifies the cryptographic suite of the key. Other types like `Ed25519VerificationKey2020` are also permissible.
*   Verification relationships like `authentication`, `assertionMethod`, `capabilityInvocation`, and `capabilityDelegation` link to specific key `id`s from the `verificationMethod` array to define their permissions.
    *   `capabilityDelegation` is typically reserved for Master Keys or other high-privilege keys authorized to delegate capabilities.
*   The `service` array is used to define service endpoints. This is particularly important for service Agents (e.g., custodians, gateways) to declare how they can be interacted with. The `type` property within a service entry (e.g., `"FiatProxyServiceNIP5"`, `"LLMGatewayNIP9"`) should be used to specify the kind of service, as defined by relevant NIPs. The `serviceEndpoint` provides the primary URL for interacting with the service, and other properties within the service entry will contain service-specific metadata as defined by the NIP for that service `type`.

```json
{
  "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
  "id": "did:example:alice",
  "controller": "did:example:alice",
  "verificationMethod": [
    {
      "id": "did:example:alice#key-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:example:alice",
      "publicKeyMultibase": "zH3C2AVvLMv6gmMNam3uVAjZpfkcJCwDwnZn6z3wXmqPV"
    },
    {
      "id": "did:example:alice#key-2",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:example:alice",
      "publicKeyMultibase": "zH3C2AVvLMv6gmMNam3uVAjZpfkcJCwDwnZn6z3wXmqPZ",
    }
  ],
  "authentication": [
    "did:example:alice#key-1"
  ],
  "assertionMethod": [
    "did:example:alice#key-1"
  ],
  "capabilityInvocation": [
    "did:example:alice#key-1",
    "did:example:alice#key-2"
  ],
  "capabilityDelegation": [
    "did:example:alice#key-1"
  ],
  "service": [
    {
      "id": "did:example:alice#llm-gateway",
      "type": "LLMGatewayNIP9",
      "serviceEndpoint": "https://alice.example.com/llm",
      "llmCapabilities": {
        "supported_models": ["gpt-4", "claude-3-opus"],
        "pricing_info_url": "https://alice.example.com/llm/pricing"
      }
    },
    {
      "id": "did:example:alice#social-profile",
      "type": "SocialWebProfile",
      "serviceEndpoint": "https://social.example.com/alice"
    }
  ]
}
```

### Signature Structure Specification

Each signature operation initiated by an Agent device or service instance should result in a structure (example uses `did:example` as a placeholder):

```json
{
  "signed_data": {
    "operation": "...",
    "params": { ... },
    "nonce": "random_nonce_123",
    "timestamp": 1715600000
  },
  "signature": {
    "signer_did": "did:example:alice",
    "key_id": "did:example:alice#key-1", 
    "value": "0x...."
  }
}
```
Verification Process:
1.  Verify `timestamp`.
2.  Check `nonce`.
3.  Resolve `signer_did`.
4.  Find `verificationMethod` for `key_id`.
5.  Verify `signature.value` with the public key.
6.  (Optional) Check `key_id` against verification relationships for the specific operation.

### Permission Control Model

Recommended strategies:
1.  **Verification Relationship-Based**: Utilize standard DID Core verification relationships.
2.  **Capability Objects**: Use ZCAP-LD or similar for fine-grained permissions.
3.  **External Policy Service**: DID document `service` endpoint points to a policy service.
4.  **Application-Layer Enforcement**: Relying Party enforces based on business logic.

**Recommendation**: Prioritize Verification Relationship-Based, combinable with Capability Objects.

#### Specific Permissions for DID Document Updates

To ensure clarity and consistent implementation, this NIP specifies the following mapping between DID document update operations and the required verification relationships. Any update to the DID document MUST be authorized by a signature from a key that is listed in the appropriate verification relationship array within the *current* version of the DID document being updated.

*   **Managing Keys and Verification Relationships (`capabilityDelegation`)**:
    *   Adding a new `verificationMethod` entry (i.e., registering a new key).
    *   Removing an existing `verificationMethod` entry (i.e., revoking a key).
    *   Modifying properties of an existing `verificationMethod` entry (e.g., `type`, `publicKeyMultibase`).
    *   Modifying the lists of key IDs within any of the verification relationship arrays (`authentication`, `assertionMethod`, `capabilityInvocation`, `capabilityDelegation` itself).
    *   **Rationale**: These operations alter the fundamental security and control structure of the DID. Therefore, they require the highest level of authorization, granted by `capabilityDelegation`. Typically, only Master Key(s) or specifically designated high-privilege keys will possess this capability.

*   **Managing Service Endpoints (`capabilityInvocation`)**:
    *   Adding a new `service` entry to the `service` array.
    *   Removing an existing `service` entry from the `service` array.
    *   Modifying an existing `service` entry (e.g., changing `serviceEndpoint`, `type`, or service-specific metadata).
    *   **Rationale**: These operations define how other Agents interact with the services offered by the DID subject. While significant, they are generally considered less critical than direct key management. `capabilityInvocation` allows designated keys to manage these service declarations.

*   **Changing the DID Controller**:
    *   Modifying the `controller` field of the DID document.
    *   **Rationale**: This operation transfers the ultimate control over the DID document to a new entity. This is the most sensitive update and implicitly requires authorization by a key that is currently designated with `authentication` and `capabilityDelegation` rights and represents the authority of the current `controller`. The specific mechanism for controller updates may also be further defined by the DID method itself.
 
Implementers MUST ensure that any attempt to update the DID document is validated against these permission requirements. An update operation MUST be rejected if the authorizing signature does not originate from a key possessing the necessary verification relationship as defined above.

### Device/Operational Key Registration / Update Protocol (Draft)

This section outlines a high-level protocol for adding a new operational key (for a device, application, or other operational context) to the DID document.

**Participants:** Agent (User or Service Admin), New Instance/Device/Application, Authorizing Instance/Device/Mechanism, Controller/Management Service, VDR.

**Protocol Flow (Example: Authentication via an Authorized Key/Device/Application):**
1.  **[New Instance/Device/Application] Key Generation**: Generates `newPubKey`, `newPrivKey`.
2.  **[New Instance/Device/Application → Controller] Initiate Registration Request**: Sends `targetDid`, `newPubKey`, desired relationships, `requestNonce`, `requestTimestamp`.
3.  **[Controller] Generate Authorization Challenge**: Creates `authChallenge`.
4.  **[Controller → New Instance/Device/Application] Return Authorization Challenge**.
5.  **[New Instance/Device/Application → Agent] Request Agent Authorization**: Presents request (e.g., QR code, admin approval flow).
6.  **[Agent @ Authorizing Instance/Mechanism] Authorize**: Agent confirms (e.g., on an authorized device, via an admin interface).
7.  **[Authorizing Instance/Mechanism → Controller] Sign and Send Authorization Proof**: Signs `authChallenge` with its authorized key, sends `authProof`.
8.  **[Controller] Verify Authorization and Update VDR**: Verifies `authProof`, constructs VDR update transaction, submits to VDR.
9.  **[VDR] Process Transaction**.
10. **[Controller → New Instance/Device/Application] Return Result**.

*(Security considerations for this protocol are detailed in the "Security Considerations" section below).*

## Rationale

-   **Single Master DID**: Chosen to provide a unified digital identity for Agents, preventing fragmentation across services and operational contexts. This aligns with the core principles of self-sovereign identity.
-   **Multi-Operational Sub-Keys**: This approach allows for operational flexibility and enhanced security. If an operational key is compromised, it can be revoked without affecting the master identity or other keys. This is preferable to using the master key for all operations, which would increase its exposure.
-   **DID Method Agnosticism**: The core model is designed to be compatible with any W3C compliant DID method, offering flexibility and future-proofing. A specific method like a potential `did:rooch` (for the Rooch Network) or established methods like `did:ethr` are examples of concrete possibilities for anchoring DIDs.
-   **Verification Relationships for Permissions**: Using standard DID verification relationships (`authentication`, `assertionMethod`, etc.) for basic permissioning is chosen for its standards compliance and interoperability. More complex authorization can be layered on top (e.g., ZCAP-LD).
-   **Explicit Key ID in Signatures**: Including `key_id` in signatures is crucial for verifiers to identify the specific key used, look it up in the DID document, and apply the correct policies.
-   **Challenge-Response for Key Registration**: This mechanism is chosen to ensure that new key registration is explicitly authorized by the Agent through a trusted channel or mechanism, preventing unauthorized additions of keys.

## Backwards Compatibility

This NIP proposes a new identity model.
-   For new Agents and services adopting this NIP, it defines the standard for DID and key management.
-   Existing systems not using this model will not be directly affected but will not be able to interoperate at the identity level described herein without adopting this NIP.
-   No direct backwards incompatibilities are introduced for unrelated protocols, but services wishing to leverage this DID model will need to implement support for it.

## Test Cases

Test cases should cover, at a minimum:
1.  Creation of a master DID and registration of an initial operational key.
2.  Registration of an additional operational key using an existing authorized key/mechanism.
3.  Signature creation by an operational key and successful verification against the DID document.
4.  Verification of a signature where the `key_id` has `authentication` permission.
5.  Verification of a signature where the `key_id` has `capabilityInvocation` but not `authentication` permission.
6.  Revocation of an operational key and subsequent failure of signature verification using the revoked key.
7.  Attempted registration of an operational key without proper authorization (should fail).
9.  Replay attack prevention using `nonce` and `timestamp`.

*(Specific test vectors and a test suite are to be developed alongside a reference implementation.)*

### Considerations for Multi-Chain DID Support

While this NIP promotes DID method agnosticism to allow for identity representation across various Verifiable Data Registries (VDRs), including different blockchains, a multi-chain DID strategy introduces several challenges that implementations and the broader ecosystem need to consider:

-   **Resolver Complexity**: Supporting multiple DID methods requires robust DID resolver implementations capable of understanding the syntax and resolution protocols for each method. This can increase the complexity of client-side applications and infrastructure that need to verify DIDs.
-   **VDR Diversity and Characteristics**: Different blockchains or other VDRs have varying characteristics regarding transaction costs, speed, finality, security assumptions, and governance models. The choice of VDR for a DID can impact its usability, security, and cost-effectiveness for different use cases.
-   **Key Management Complexity**: Agents (both users and services) may need to manage multiple types of cryptographic keys if their DIDs or associated `verificationMethod` entries are anchored to different blockchains with distinct cryptographic requirements. This can increase the burden of key generation, storage, backup, and recovery.
-   **Cross-Chain Interoperability and Data Portability**: While a DID provides a universal identifier, achieving true interoperability of associated data or credentials across different blockchain environments remains a significant challenge. Standards for data formats and protocols are crucial but may not be universally adopted or supported.
-   **User Experience (UX)**: Abstracting the complexities of multiple chains and DID methods to provide a seamless and intuitive user experience is critical for adoption. Users should ideally not need to understand the underlying blockchain specifics to manage their digital identity.
-   **Standardization and Consistent Interpretation**: Ensuring that DID documents and the capabilities implied by `verificationMethod` entries are interpreted consistently across different chains and platforms is essential. Lack of such consistency can lead to security vulnerabilities or interoperability failures.
-   **Governance and Trust**: Each DID method and its underlying VDR typically has its own governance model and trust assumptions. Integrating DIDs from various methods requires careful consideration of these differing trust frameworks.

Addressing these challenges will be crucial for realizing the full potential of a flexible, multi-chain identity ecosystem based on this NIP.

## Reference Implementation

The official reference implementation for TypeScript/JavaScript environments is [`@nuwa-ai/identity-kit`](https://github.com/nuwa-protocol/nuwa/tree/main/nuwa-kit/typescript/packages/identity-kit). It provides:
-   A high-level `IdentityKit` class for managing the full lifecycle of a DID, including operational key management (add/remove `verificationMethod`) and service endpoint management, compliant with NIP-1.
-   Pluggable VDR (Verifiable Data Registry) modules, with built-in support for `did:key` and `did:rooch`.
-   A `KeyManager` for handling cryptographic keys, with default storage backends for browsers (`LocalStorage`, `IndexedDB`) and Node.js (`Memory`).
-   Utilities for cryptographic operations and signature generation/verification that form the foundation for NIP-2.

This SDK serves as the canonical implementation of the NIP-1 model.

## Security Considerations

This section incorporates and expands upon the "Security Policies" from the original NIP-1.

*   **Master Key Security**:
    *   **Compromise**: Compromise of the Master Key(s) leads to full identity compromise. Secure storage (e.g., offline for users, HSMs for services) and robust recovery mechanisms are paramount.
    *   **Recovery**: The design of recovery mechanisms (social, multi-sig, M-of-N) must itself be secure against collusion or coercion.
*   **Operational Key Security**:
    *   **Compromise**: If an operational key is compromised, it should be promptly revoked by the Controller. The scope of damage is limited by the permissions granted to that key.
    *   **Revocation**: The revocation process must be secure, ensuring only a legitimate Controller can perform it. Delays in VDR updates could mean a compromised key remains valid for a short period.
    *   **Rotation**: Regular rotation of operational keys is recommended to limit the window of opportunity if a key is silently compromised.
*   **Signature Integrity & Anti-Replay**:
    *   **Nonce**: Verifiers must maintain a list of used nonces per `signer_did` (or `key_id`) to prevent replay. This requires stateful verifiers.
    *   **Timestamp**: Timestamps prevent replay of old signatures. A defined, reasonable verification window is needed, balancing security with tolerance for clock skew.
    *   **Signed Payload**: The `signed_data` structure must be canonicalized before signing to prevent ambiguity.
*   **Key Registration Protocol Security**:
    *   **Communication Security**: All communication (New Instance/Device ↔ Controller, Authorizing Instance/Mechanism ↔ Controller) must be over secure channels (e.g., TLS).
    *   **Challenge-Response**: `authChallenge` must be unique, unpredictable, and tied to the specific request.
    *   **Authorization Proof**: The key used by the Authorizing Instance/Mechanism must have explicit permission to authorize new keys.
    *   **Agent Consent/Control**: UI/UX (for users) or admin controls (for services) must clearly present what is being authorized.
    *   **Controller Trust**: If the Controller is a centralized service, its security and the trust model are critical. It becomes a high-value target. For decentralized control, the security of the control mechanism is key.
    *   **Rate Limiting**: The Controller should implement rate limiting on registration attempts.
*   **DID Document Security**:
    *   **VDR Security**: The integrity of the DID document relies on the security of the underlying Verifiable Data Registry.
    *   **Unauthorized Updates**: Only the `controller` of the DID should be able to update it.
*   **Privacy Considerations**:
    *   Avoid storing sensitive instance/device-specific information directly in the public DID document. Use generic `key_id` fragments.
    *   Metadata exchanged during registration should be minimized and potentially encrypted if sensitive.
*   **Passkey-based Sybil Risk**: While using WebAuthn Passkeys (often via `did:key`) for bootstrapping DIDs offers excellent usability, implementers should be aware of the potential for Sybil attacks if Passkey creation is too unconstrained. Pairing Passkey-based DID onboarding with mechanisms like proof-of-uniqueness or resource commitment, such as those that can be indicated by a Custodian-Assisted DID Onboarding Protocol (CADOP) provider (e.g., through its `sybilLevel` metadata or associated `Web2ProofServiceCADOP`), is recommended to mitigate this risk, especially for services sensitive to such attacks.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
