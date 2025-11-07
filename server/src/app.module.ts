import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MulterModule } from '@nestjs/platform-express';

const CLIENT_MODULES = ClientsModule.register([
  {
    name: 'MQTT_SERVICE',
    transport: Transport.MQTT,
    options: {
      url: 'mqtt://broker:1883',
    },
  },
]);

const MULTER_MODULE = MulterModule.register({
  dest: './uploads', // directory of the  uploaded file
});

@Module({
  imports: [CLIENT_MODULES, MULTER_MODULE],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
