import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpException,
  HttpStatus,
  UseGuards, // <-- Import this
} from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyAuthGuard } from './auth.guard'; // <-- Import the guard

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // This endpoint is for you to trigger. It doesn't need auth.
  @Get('/request-file/:clientId')
  requestFile(@Param('clientId') clientId: string) {
    return this.appService.requestFileFromClient(clientId);
  }

  // --- THESE ENDPOINTS MUST BE SECURED ---

  @Post('/upload-chunk')
  @UseGuards(ApiKeyAuthGuard) // <-- Apply the guard
  @UseInterceptors(FileInterceptor('file'))
  async uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { transferId: string; chunkIndex: string },
  ) {
    if (!file) {
      throw new HttpException('No file chunk received', HttpStatus.BAD_REQUEST);
    }
    return this.appService.saveChunk(file, body);
  }

  @Post('/upload-complete')
  @UseGuards(ApiKeyAuthGuard) // <-- Apply the guard
  async uploadComplete(
    @Body()
    body: {
      transferId: string;
      totalChunks: string;
      originalFilename: string;
      fullFileHash: string; // <-- Now expecting the hash
    },
  ) {
    return this.appService.reassembleChunks(body);
  }
}
