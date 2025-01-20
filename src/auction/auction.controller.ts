/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuctionService } from './auction.service';

@Controller('auctions')
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createAuction(
    @Body() body: { title: string; startTime: Date; endTime: Date },
    @Request() req,
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Only admins can create auctions');
    }
    return this.auctionService.createAuction(body.title, body.startTime, body.endTime);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAuctions(@Request() req) {
    console.log('Authenticated user:', req.user);
    return this.auctionService.getAuctions();
  }

  @Post(':id/bid')
  @UseGuards(JwtAuthGuard)
  async placeBid(
    @Param('id') id: string,
    @Body() body: { bidAmount: number },
    @Request() req,
  ) {
    const userId = req.user.userId;
    return this.auctionService.placeBid(id, userId, body.bidAmount);
  }
}

