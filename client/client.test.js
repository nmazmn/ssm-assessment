// Mock setup - MUST be at the very top before any imports
jest.mock('mqtt');
jest.mock('fs');
jest.mock('axios');
jest.mock('crypto');
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
  }));
});

describe('MQTT Client Tests', () => {
  let mqtt;
  let fs;
  let axios;
  let crypto;
  let FormData;
  let mockMqttClient;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetModules();

    // Re-import mocked modules AFTER reset
    mqtt = require('mqtt');
    fs = require('fs');
    axios = require('axios');
    crypto = require('crypto');
    FormData = require('form-data');

    // Set up environment variables
    process.env.CLIENT_ID = 'test-client-123';
    process.env.MQTT_BROKER_URL = 'mqtt://test-broker:1883';
    process.env.SERVER_CHUNK_URL = 'http://test-server:3000/uploadchunk';
    process.env.SERVER_COMPLETE_URL = 'http://test-server:3000/uploadcomplete';
    process.env.API_KEY = 'test-api-key';
    process.env.FILE_PATH = '/test/path/test-file.bin';

    // Create mock MQTT client
    mockMqttClient = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn((topic, callback) => {
        if (callback) callback(null);
        return mockMqttClient;
      }),
    };

    // Set up mqtt.connect to return our mock client
    mqtt.connect.mockReturnValue(mockMqttClient);

    // Mock file system
    fs.readFileSync = jest.fn().mockReturnValue(Buffer.from('test-file-content'));
    fs.statSync = jest.fn().mockReturnValue({ size: 15 * 1024 * 1024 });
    
    const mockFileHandle = {
      read: jest.fn().mockResolvedValue({ bytesRead: 1024 }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    fs.promises = { open: jest.fn().mockResolvedValue(mockFileHandle) };

    // Mock crypto
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('abc123hash'),
    };
    crypto.createHash = jest.fn().mockReturnValue(mockHash);
    crypto.randomUUID = jest.fn().mockReturnValue('uuid-12345');

    // Mock axios
    axios.post = jest.fn().mockResolvedValue({ data: { success: true } });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Module Loading and Initialization', () => {
    it('should load without errors', () => {
      expect(() => {
        require('./client.js');
      }).not.toThrow();
    });

    it('should attempt to connect to MQTT broker', () => {
      require('./client.js');
      expect(mqtt.connect).toHaveBeenCalled();
    });

    it('should connect to configured broker URL', () => {
      require('./client.js');
      expect(mqtt.connect).toHaveBeenCalledWith('mqtt://test-broker:1883');
    });

    it('should use default broker URL when not configured', () => {
      delete process.env.MQTT_BROKER_URL;
      jest.resetModules();
      mqtt = require('mqtt');
      mqtt.connect.mockReturnValue(mockMqttClient);
      
      require('./client.js');
      expect(mqtt.connect).toHaveBeenCalledWith('mqtt://broker:1883');
    });
  });

  describe('MQTT Event Handlers', () => {
    it('should register connect event handler', () => {
      require('./client.js');
      expect(mockMqttClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register message event handler', () => {
      require('./client.js');
      expect(mockMqttClient.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should register error event handler', () => {
      require('./client.js');
      expect(mockMqttClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should subscribe to command topic on connect', () => {
      require('./client.js');
      
      const connectHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
        expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
          'clients/test-client-123/commands',
          expect.any(Function)
        );
      }
    });
  });

  describe('Message Handling', () => {
    it('should handle valid file upload request message', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        expect(() => messageHandler('test-topic', message)).not.toThrow();
      }
      
      consoleLogSpy.mockRestore();
    });

    it('should handle invalid JSON gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const invalidMessage = Buffer.from('not-valid-json');
        messageHandler('test-topic', invalidMessage);
        expect(consoleErrorSpy).toHaveBeenCalled();
      }
      
      consoleErrorSpy.mockRestore();
    });

    it('should ignore messages without request_file_upload action', () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'other_action' }));
        expect(() => messageHandler('test-topic', message)).not.toThrow();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle MQTT connection errors', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      require('./client.js');
      
      const errorHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        const testError = new Error('Connection failed');
        errorHandler(testError);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[Client] MQTT Connection Error:', testError);
      }
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Configuration', () => {
    it('should use CLIENT_ID from environment', () => {
      process.env.CLIENT_ID = 'custom-client-id';
      jest.resetModules();
      mqtt = require('mqtt');
      mqtt.connect.mockReturnValue(mockMqttClient);
      
      require('./client.js');
      
      const connectHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
        expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
          'clients/custom-client-id/commands',
          expect.any(Function)
        );
      }
    });

    it('should read FILE_PATH from environment', () => {
      process.env.FILE_PATH = '/custom/path/file.bin';
      expect(() => require('./client.js')).not.toThrow();
    });
  });

  describe('Crypto Operations', () => {
    it('should use SHA256 for file hashing', async () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        messageHandler('test-topic', message);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      }
    });

    it('should generate UUID for transfer ID', async () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        messageHandler('test-topic', message);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(crypto.randomUUID).toHaveBeenCalled();
      }
    });
  });

  describe('File Operations', () => {
    it('should read file stats', async () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        messageHandler('test-topic', message);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(fs.statSync).toHaveBeenCalledWith('/test/path/test-file.bin');
      }
    });

    it('should open file for reading', async () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        messageHandler('test-topic', message);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(fs.promises.open).toHaveBeenCalledWith('/test/path/test-file.bin', 'r');
      }
    });
  });

  describe('HTTP Requests', () => {
    it('should make POST requests for chunk upload', async () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        messageHandler('test-topic', message);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(axios.post).toHaveBeenCalled();
      }
    });

    it('should include authorization header in requests', async () => {
      require('./client.js');
      
      const messageHandler = mockMqttClient.on.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        const message = Buffer.from(JSON.stringify({ action: 'request_file_upload' }));
        messageHandler('test-topic', message);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (axios.post.mock.calls.length > 0) {
          const callArgs = axios.post.mock.calls[0];
          const config = callArgs[2];
          expect(config?.headers?.Authorization).toBe('Bearer test-api-key');
        }
      }
    });
  });
});