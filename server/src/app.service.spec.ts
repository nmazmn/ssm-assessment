/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { ClientProxy } from '@nestjs/microservices';
import * as mqtt from 'mqtt';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';

// Mock mqtt module
jest.mock('mqtt');

// Mock fs-extra module
jest.mock('fs-extra');

describe('AppService', () => {
  let service: AppService;
  let mockMqttClient: any;
  let mockClientProxy: Partial<ClientProxy>;

  beforeEach(async () => {
    // Create mock MQTT client
    mockMqttClient = {
      on: jest.fn(),
      publish: jest.fn((topic, message, callback) => {
        if (callback) callback(null);
      }),
      connect: jest.fn(),
    };

    // Mock mqtt.connect to return our mock client
    (mqtt.connect as jest.Mock).mockReturnValue(mockMqttClient);

    // Create mock ClientProxy
    mockClientProxy = {
      connect: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: 'MQTT_SERVICE',
          useValue: mockClientProxy,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create MQTT client on construction', () => {
      expect(mqtt.connect).toHaveBeenCalledWith('mqtt://broker:1883');
    });

    it('should register MQTT event handlers', () => {
      expect(mockMqttClient.on).toHaveBeenCalledWith(
        'connect',
        expect.any(Function),
      );
      expect(mockMqttClient.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });

    it('should call connect on module init', async () => {
      await service.onModuleInit();
      expect(mockClientProxy.connect).toHaveBeenCalled();
    });
  });

  describe('requestFileFromClient', () => {
    it('should publish request to correct MQTT topic', () => {
      const clientId = 'client-123';
      const expectedTopic = `clients/${clientId}/commands`;
      const expectedPayload = JSON.stringify({ action: 'request_file_upload' });

      const result = service.requestFileFromClient(clientId);

      expect(mockMqttClient.publish).toHaveBeenCalledWith(
        expectedTopic,
        expectedPayload,
        expect.any(Function),
      );
      expect(result).toEqual({ message: `Request sent to client ${clientId}` });
    });

    it('should handle different client IDs', () => {
      const clientIds = ['client-1', 'client-abc', 'test-client'];

      clientIds.forEach((clientId) => {
        service.requestFileFromClient(clientId);
        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          `clients/${clientId}/commands`,
          expect.any(String),
          expect.any(Function),
        );
      });
    });
  });

  describe('reassembleChunks', () => {
    const mockBody = {
      transferId: 'transfer-789',
      totalChunks: '3',
      originalFilename: 'test-file.bin',
      fullFileHash: 'abc123def456',
    };

    let mockWriteStream: any;

    beforeEach(() => {
      mockWriteStream = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setImmediate(callback);
          }
          return mockWriteStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as unknown as jest.Mock).mockResolvedValue(
        Buffer.from('chunk-data'),
      );
      (fs.unlink as unknown as jest.Mock).mockResolvedValue(undefined);
      (fs.rmdir as unknown as jest.Mock).mockResolvedValue(undefined);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        Buffer.from('complete-file-data'),
      );

      // Mock crypto
      jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abc123def456'),
      } as any);
    });

    it('should reassemble all chunks in order', async () => {
      const result = await service.reassembleChunks(mockBody);

      expect(fs.createWriteStream).toHaveBeenCalledWith(
        path.join('uploads', 'test-file.bin'),
      );

      // Should read and write all 3 chunks
      expect(fs.readFile).toHaveBeenCalledTimes(4);
      expect(mockWriteStream.write).toHaveBeenCalledTimes(3);
      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });

    it('should verify checksum matches', async () => {
      const result = await service.reassembleChunks(mockBody);

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      expect(result).toEqual({
        message: 'File reassembled and verified successfully',
      });
    });

    it('should detect checksum mismatch', async () => {
      jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('wrong-hash'),
      } as any);
    });

    it('should throw error if chunk is missing', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false); // Second chunk missing

      await expect(service.reassembleChunks(mockBody)).rejects.toThrow(
        'Missing chunk 1 for transfer transfer-789',
      );
    });

    it('should clean up temp directory after reassembly', async () => {
      await service.reassembleChunks(mockBody);

      expect(fs.rmdir).toHaveBeenCalledWith(
        path.join('uploads', 'temp', 'transfer-789'),
      );
    });

    it('should handle large number of chunks', async () => {
      const largeBody = {
        ...mockBody,
        totalChunks: '100',
      };

      await service.reassembleChunks(largeBody);

      expect(fs.readFile).toHaveBeenCalledTimes(101);
      expect(mockWriteStream.write).toHaveBeenCalledTimes(100);
    });
  });

  describe('MQTT Connection Events', () => {
    it('should handle connect event', () => {
      const connectHandler = mockMqttClient.on.mock.calls.find(
        (call) => call[0] === 'connect',
      )[1];

      // Should not throw
      expect(() => connectHandler()).not.toThrow();
    });

    it('should handle error event', () => {
      const errorHandler = mockMqttClient.on.mock.calls.find(
        (call) => call[0] === 'error',
      )[1];

      // Should not throw
      expect(() => errorHandler(new Error('Connection failed'))).not.toThrow();
    });
  });
});
