/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Auction } from '../db/model/auction.schema';

@Injectable()
export class AuctionService {
  constructor(@InjectModel(Auction.name) private auctionModel: Model<Auction>) {}

  async createAuction(title: string, startTime: Date, endTime: Date) {
    const auction = new this.auctionModel({ title, startTime, endTime });
    return auction.save();
  }

  async getAuctions() {
    return this.auctionModel.find().exec();
  }

  async getAuctionById(id: string) {
    const auction = await this.auctionModel.findById(id).exec();
    if (!auction) {
      throw new NotFoundException('Auction not found');
    }
    return auction;
  }

  async placeBid(auctionId: string, userId: string, amount: number) {
    const auction = await this.getAuctionById(auctionId);
    if (amount <= auction.currentBid) {
      throw new Error('Bid must be higher than the current bid');
    }

    auction.bids.push({ userId, amount });
    auction.currentBid = amount;
    return auction.save();
  }
}
