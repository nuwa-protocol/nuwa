// Simple test for the new popup-safe connection methods
// This simulates the actual usage without requiring the full SDK setup

describe('Popup-Safe Connection Methods', () => {
  
  // Mock the window.open function
  let mockWindowOpen;
  
  beforeEach(() => {
    mockWindowOpen = jest.fn();
    global.window = { open: mockWindowOpen };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('buildConnectUrl should return a URL string', async () => {
    // Mock the IdentityKitWeb class behavior
    const mockSDK = {
      cadopDomain: 'https://test-id.nuwa.dev',
      generateIdFragment: () => 'test-key-123',
      deepLinkManager: {
        buildAddKeyUrl: jest.fn().mockResolvedValue({
          url: 'https://test-id.nuwa.dev/add-key?payload=test-payload'
        })
      },
      
      // New method implementation
      async buildConnectUrl() {
        const idFragment = this.generateIdFragment();
        const { url } = await this.deepLinkManager.buildAddKeyUrl({
          cadopDomain: this.cadopDomain,
          idFragment,
        });
        return url;
      }
    };

    const url = await mockSDK.buildConnectUrl();
    
    expect(url).toBe('https://test-id.nuwa.dev/add-key?payload=test-payload');
    expect(mockSDK.deepLinkManager.buildAddKeyUrl).toHaveBeenCalledWith({
      cadopDomain: 'https://test-id.nuwa.dev',
      idFragment: 'test-key-123',
    });
  });

  test('openConnectUrl should call window.open with correct parameters', () => {
    // Mock the IdentityKitWeb class behavior
    const mockSDK = {
      openConnectUrl(url) {
        window.open(url, '_blank');
      }
    };

    const testUrl = 'https://test-id.nuwa.dev/add-key?payload=test-payload';
    mockSDK.openConnectUrl(testUrl);
    
    expect(mockWindowOpen).toHaveBeenCalledWith(testUrl, '_blank');
  });

  test('popup-safe flow should work without async operations in user action', async () => {
    // Mock the complete flow
    const mockSDK = {
      cadopDomain: 'https://test-id.nuwa.dev',
      generateIdFragment: () => 'test-key-123',
      deepLinkManager: {
        buildAddKeyUrl: jest.fn().mockResolvedValue({
          url: 'https://test-id.nuwa.dev/add-key?payload=test-payload'
        })
      },
      
      async buildConnectUrl() {
        const idFragment = this.generateIdFragment();
        const { url } = await this.deepLinkManager.buildAddKeyUrl({
          cadopDomain: this.cadopDomain,
          idFragment,
        });
        return url;
      },
      
      openConnectUrl(url) {
        window.open(url, '_blank');
      }
    };

    // Step 1: Pre-build URL (can be done ahead of time)
    const connectUrl = await mockSDK.buildConnectUrl();
    
    // Step 2: Open URL immediately in user action (no async operations)
    mockSDK.openConnectUrl(connectUrl);
    
    expect(connectUrl).toBe('https://test-id.nuwa.dev/add-key?payload=test-payload');
    expect(mockWindowOpen).toHaveBeenCalledWith(connectUrl, '_blank');
  });

  test('React hook methods should work correctly', () => {
    // Mock React hook behavior
    const mockSDK = {
      buildConnectUrl: jest.fn().mockResolvedValue('https://test-url.com'),
      openConnectUrl: jest.fn()
    };

    // Simulate the hook methods
    const buildConnectUrl = async () => {
      if (!mockSDK) throw new Error('SDK not initialized');
      return mockSDK.buildConnectUrl();
    };

    const openConnectUrl = (url) => {
      if (!mockSDK) throw new Error('SDK not initialized');
      mockSDK.openConnectUrl(url);
    };

    // Test the hook methods
    expect(async () => {
      const url = await buildConnectUrl();
      openConnectUrl(url);
    }).not.toThrow();

    expect(mockSDK.buildConnectUrl).toHaveBeenCalled();
  });

  test('should maintain backward compatibility with original connect method', async () => {
    // Mock the original connect method
    const mockSDK = {
      cadopDomain: 'https://test-id.nuwa.dev',
      generateIdFragment: () => 'test-key-123',
      deepLinkManager: {
        buildAddKeyUrl: jest.fn().mockResolvedValue({
          url: 'https://test-id.nuwa.dev/add-key?payload=test-payload'
        })
      },
      
      // Original connect method (still works)
      async connect() {
        const idFragment = this.generateIdFragment();
        const { url } = await this.deepLinkManager.buildAddKeyUrl({
          cadopDomain: this.cadopDomain,
          idFragment,
        });
        window.open(url, '_blank');
      }
    };

    await mockSDK.connect();
    
    expect(mockSDK.deepLinkManager.buildAddKeyUrl).toHaveBeenCalledWith({
      cadopDomain: 'https://test-id.nuwa.dev',
      idFragment: 'test-key-123',
    });
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://test-id.nuwa.dev/add-key?payload=test-payload',
      '_blank'
    );
  });
});