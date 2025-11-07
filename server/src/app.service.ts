import {
  Inject,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto'; // <-- Import crypto

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(@Inject('MQTT_SERVICE') private client: ClientProxy) {
    this.logger.log('AppService Constructor called. Service is being created.');
  }

  // This method is called once the module has been initialized
  async onModuleInit() {
    try {
      this.logger.log('hjahahaha');
      // Connect to the broker
      await this.client.connect();

      // THIS IS YOUR LOG
      this.logger.log('Successfully connected to MQTT broker');
    } catch (err) {
      // Log the error if connection fails
      this.logger.error(`Error connecting to MQTT broker: ${err.message}`);
    }
  }

  // ... requestFileFromClient() and saveChunk() are the same ...
  requestFileFromClient(clientId: string) {
    this.logger.log(`Publishing 'request_file' to client: ${clientId}`);
    const topic = `clients/${clientId}/commands`;
    const payload = { action: 'request_file_upload' };
    this.client.emit(topic, JSON.stringify(payload));
    return { message: `Request sent to client ${clientId}` };
  }

  async saveChunk(
    file: Express.Multer.File,
    body: { transferId: string; chunkIndex: string },
  ) {
    const tempDir = path.join('uploads', 'temp', body.transferId);
    await fs.ensureDir(tempDir);
    const chunkPath = path.join(tempDir, `chunk_${body.chunkIndex}`);
    await fs.move(file.path, chunkPath, { overwrite: true });
    this.logger.log(`Saved chunk ${body.chunkIndex} for ${body.transferId}`);
    return { message: 'Chunk received' };
  }

  // --- This method is UPDATED ---
  async reassembleChunks(body: {
    transferId: string;
    totalChunks: string;
    originalFilename: string;
    fullFileHash: string; // <-- We get the hash from the client
  }) {
    const tempDir = path.join('uploads', 'temp', body.transferId);
    const finalFilePath = path.join('uploads', body.originalFilename);
    const totalChunks = parseInt(body.totalChunks, 10);

    this.logger.log(
      `Reassembling ${body.originalFilename} from ${totalChunks} chunks.`,
    );

    try {
      const writeStream = fs.createWriteStream(finalFilePath);

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(tempDir, `chunk_${i}`);
        if (!fs.existsSync(chunkPath)) {
          throw new Error(`Missing chunk ${i} for transfer ${body.transferId}`);
        }

        const chunkBuffer = await fs.readFile(chunkPath);
        writeStream.write(chunkBuffer);
        await fs.unlink(chunkPath); // Delete chunk after appending
      }

      writeStream.end();
      await fs.rmdir(tempDir);

      // --- START CHECKSUM VERIFICATION ---
      await new Promise<void>((resolve) =>
        writeStream.on('finish', () => resolve()),
      ); // Wait for file to finish writing// Wait for file to finish writing // Wait for file to finish writing

      this.logger.log(`Reassembly complete. Verifying file integrity...`);
      const fileBuffer = await fs.readFile(finalFilePath);
      const serverHash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      if (serverHash === body.fullFileHash) {
        this.logger.log(`File integrity verified (SHA256: ${serverHash})`);
        return { message: 'File reassembled and verified successfully' };
      } else {
        this.logger.error(`File integrity check FAILED.`);
        this.logger.error(`Client hash: ${body.fullFileHash}`);
        this.logger.error(`Server hash: ${serverHash}`);
        await fs.unlink(finalFilePath); // Delete corrupt file
        throw new HttpException(
          'File integrity check failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      // --- END CHECKSUM VERIFICATION ---
    } catch (error) {
      this.logger.error('Error reassembling file:', error);
      await fs.remove(tempDir); // Clean up temp dir on failure
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
