/* eslint-disable prettier/prettier */
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Auction extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ default: 0 })
  currentBid: number;

  @Prop({ default: [] })
  bids: { userId: string; amount: number }[];
}

export const AuctionSchema = SchemaFactory.createForClass(Auction);
