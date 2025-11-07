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
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyAuthGuard } from './auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/download/:clientId')
  requestFile(@Param('clientId') clientId: string) {
    return this.appService.requestFileFromClient(clientId);
  }

  @Post('/uploadchunk')
  @UseGuards(ApiKeyAuthGuard)
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

  @Post('/uploadcomplete')
  @UseGuards(ApiKeyAuthGuard)
  async uploadComplete(
    @Body()
    body: {
      transferId: string;
      totalChunks: string;
      originalFilename: string;
      fullFileHash: string;
    },
  ) {
    return this.appService.reassembleChunks(body);
  }
}
