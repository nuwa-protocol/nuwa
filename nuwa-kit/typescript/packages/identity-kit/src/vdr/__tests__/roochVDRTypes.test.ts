import { RoochAddress } from '@roochnetwork/rooch-sdk';
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
      value:
        '0x05726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330105726f6f636840726f6f636831686a37337a673434656e6d30657a667a767a73757434326b6d36796368733665657a633334636567636337346b77753339613673796d6e667466010b6163636f756e742d6b657905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330b6163636f756e742d6b6579214563647361536563703235366b31566572696669636174696f6e4b65793230313905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367332e7a3233484a517a7651394177474241366e4e6772733170636943697564456f59536d706671516342556f62775158010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b657900000013f33f1da3823e2a3ace28b27a09b58278a6bec446894186fe156d44ccbf138e',
    };

    const didDocument = convertMoveDIDDocumentToInterface(
      mockObjectState as any
    ) as Required<DIDDocument>;

    expect(didDocument['@context']).toEqual(['https://www.w3.org/ns/did/v1']);
    expect(didDocument.id).toBe(
      'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3'
    );

    expect(didDocument.controller).toHaveLength(1);
    expect(didDocument.controller[0]).toBe(
      'did:rooch:rooch1hj73zg44enm0ezfzvzsut42km6ychs6eezc34cegcc74kwu39a6symnftf'
    );

    expect(didDocument.verificationMethod).toHaveLength(1);
    const vm = didDocument.verificationMethod[0];
    expect(vm.id).toBe(
      'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3#account-key'
    );
    expect(vm.type).toBe('EcdsaSecp256k1VerificationKey2019');
    expect(vm.controller).toBe(
      'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3'
    );
    expect(vm.publicKeyMultibase).toBe('z23HJQzvQ9AwGBA6nNgrs1pciCiudEoYSmpfqQcBUobwQX');

    const methodRef =
      'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3#account-key';
    expect(didDocument.authentication).toEqual([methodRef]);
    expect(didDocument.assertionMethod).toEqual([methodRef]);
    expect(didDocument.capabilityInvocation).toEqual([methodRef]);
    expect(didDocument.capabilityDelegation).toEqual([methodRef]);
    expect(didDocument.keyAgreement).toEqual([]);

    expect(didDocument.service).toEqual([]);
    expect(didDocument.alsoKnownAs).toEqual([]);
  });

  it('should convert Move DIDDocument to ServiceEndpoint correctly', () => {
    const mockObjectState = {
      value:
        '0x05726f6f636840726f6f636831353072767161396b383339363070777a77643272743071736e346a637a367163683563366a3736323633386d397173726d3334716374716a78720105726f6f636840726f6f63683139326877757738323436326b6c78746461353265787a347a6d7176733063337a736b35686b3633376679787765307372717664717574766a6375010b6163636f756e742d6b657905726f6f636840726f6f636831353072767161396b383339363070777a77643272743071736e346a637a367163683563366a3736323633386d397173726d3334716374716a78720b6163636f756e742d6b6579214563647361536563703235366b31566572696669636174696f6e4b65793230313905726f6f636840726f6f636831353072767161396b383339363070777a77643272743071736e346a637a367163683563366a3736323633386d397173726d3334716374716a78722d7a727177455a746b436e77527678725143594337683253486b4b4a707958586a47647165684a6366574a674132010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b657900010b637573746f6469616e2d3105726f6f636840726f6f636831353072767161396b383339363070777a77643272743071736e346a637a367163683563366a3736323633386d397173726d3334716374716a78720b637573746f6469616e2d31154361646f70437573746f6469616e5365727669636515687474703a2f2f6c6f63616c686f73743a383038300312637573746f6469616e5075626c69634b65792d7a727177455a746b436e77527678725143594337683253486b4b4a707958586a47647165684a6366574a67413216637573746f6469616e53657276696365564d54797065214563647361536563703235366b31566572696669636174696f6e4b6579323031390b6465736372697074696f6e165465737420437573746f6469616e205365727669636500a3c6c074b63c4ba785c2735435bc109d65816818bd31a97b4ad44fb28203dc6a',
    };
    const didDocument = convertMoveDIDDocumentToInterface(
      mockObjectState as any
    ) as Required<DIDDocument>;
    const service = didDocument.service[0];
    console.log('service', JSON.stringify(service, null, 2));
    expect(service.id).toBe(
      'did:rooch:rooch150rvqa9k83960pwzwd2rt0qsn4jcz6qch5c6j762638m9qsrm34qctqjxr#custodian-1'
    );
    expect(service.type).toBe('CadopCustodianService');
    expect(service.serviceEndpoint).toBe('http://localhost:8080');
    expect(service.custodianPublicKey).toBe('zrqwEZtkCnwRvxrQCYC7h2SHkKJpyXXjGdqehJcfWJgA2');
    expect(service.custodianServiceVMType).toBe('EcdsaSecp256k1VerificationKey2019');
    expect(service.description).toBe('Test Custodian Service');
  });
});
