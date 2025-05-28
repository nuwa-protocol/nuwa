import { 
  RoochAddress,
} from '@roochnetwork/rooch-sdk';
import { resolveDidObjectID, convertMoveDIDDocumentToInterface } from '../roochVDRTypes';
import { DIDDocument } from '../../types';

describe('roochVDRTypes', () => {
  it('should resolve DIDDocument Object ID correctly', () => {
    const identifier = new RoochAddress('0x42').toBech32Address();
    const objectId = resolveDidObjectID(identifier);
    // Same as the test in did.move
    expect(objectId).toBe('0x0a4c8c7cdb9708e8c687641af732bd60a7a5530c11361ae0a6ca8749db535ea5');
  });

  it('should convert BCS hex to DIDDocument correctly', () => {
    const mockObjectState = {
      value: '0x05726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330105726f6f636840726f6f636831686a37337a673434656e6d30657a667a767a73757434326b6d36796368733665657a633334636567636337346b77753339613673796d6e667466010b6163636f756e742d6b657905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330b6163636f756e742d6b6579214563647361536563703235366b31566572696669636174696f6e4b65793230313905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367332e7a3233484a517a7651394177474241366e4e6772733170636943697564456f59536d706671516342556f62775158010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b657900000013f33f1da3823e2a3ace28b27a09b58278a6bec446894186fe156d44ccbf138e'
    };

    const didDocument = convertMoveDIDDocumentToInterface(mockObjectState as any) as Required<DIDDocument>;

    expect(didDocument['@context']).toEqual(['https://www.w3.org/ns/did/v1']);
    expect(didDocument.id).toBe('did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3');

    expect(didDocument.controller).toHaveLength(1);
    expect(didDocument.controller[0]).toBe('did:rooch:rooch1hj73zg44enm0ezfzvzsut42km6ychs6eezc34cegcc74kwu39a6symnftf');

    expect(didDocument.verificationMethod).toHaveLength(1);
    const vm = didDocument.verificationMethod[0];
    expect(vm.id).toBe('did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3#account-key');
    expect(vm.type).toBe('EcdsaSecp256k1VerificationKey2019');
    expect(vm.controller).toBe('did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3');
    expect(vm.publicKeyMultibase).toBe('z23HJQzvQ9AwGBA6nNgrs1pciCiudEoYSmpfqQcBUobwQX');

    const methodRef = 'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3#account-key';
    expect(didDocument.authentication).toEqual([methodRef]);
    expect(didDocument.assertionMethod).toEqual([methodRef]);
    expect(didDocument.capabilityInvocation).toEqual([methodRef]);
    expect(didDocument.capabilityDelegation).toEqual([methodRef]);
    expect(didDocument.keyAgreement).toEqual([]);

    expect(didDocument.service).toEqual([]);
    expect(didDocument.alsoKnownAs).toEqual([]);
  });
}); 