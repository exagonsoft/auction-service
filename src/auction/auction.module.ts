/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';
import { Auction, AuctionSchema } from '../db/model/auction.schema';
import { JwtStrategy } from './jwt.strategy';
import { AuctionGateway } from './auction.gateway';
import { Vehicle, VehicleSchema } from 'src/db/model/vehicle.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Auction.name, schema: AuctionSchema }]),
    MongooseModule.forFeature([{ name: Vehicle.name, schema: VehicleSchema }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Shared secret for validation
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuctionController],
  providers: [AuctionService, AuctionGateway, JwtStrategy],
})
export class AuctionModule {}

