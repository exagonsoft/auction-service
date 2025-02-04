/* eslint-disable prettier/prettier */
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface VehicleMedia {
  id: number;
  type: "image" | "video"; // Restrict type to "image" or "video"
  url: string;
}

@Schema()
export class Vehicle extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: false })
  country: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: [], required: false })
  media: VehicleMedia[];

  @Prop({ required: true})
  userId: string

  @Prop({ default: true})
  available: boolean
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
