/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuctionService } from './auction.service';
import { JwtService } from '@nestjs/jwt';
import { Socket, Server } from 'socket.io';
import { UnauthorizedException } from '@nestjs/common';
import { auctionBid, AuctionLot, StaticMedia } from 'src/types/customTypes';
import { allowedDomains } from 'src/settings/corsWhitelist';

@WebSocketGateway({
  cors: {
    origins: allowedDomains, // Allow the frontend URL
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class AuctionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  private bidsList: Array<auctionBid> = [];
  private currentBid: auctionBid;
  private currentLot: { auctionId: string; lot: AuctionLot };
  private currentMedia: { auctionId: string; media: StaticMedia };
  private auctionRooms: Record<string, Set<string>> = {};
  private auctionTimers: Record<string, NodeJS.Timeout> = {};

  constructor(
    private readonly auctionService: AuctionService,
    private readonly jwtService: JwtService,
  ) {
    this.currentBid = {
      auctionId: '',
      username: '',
      bidAmount: 0,
    };
    this.currentMedia = {
      auctionId: 'auction123',
      media: {
        id: 1,
        type: 'image',
        url: '/media/no_media.gif',
        description: 'Descripcion Camion 1',
      },
    };
    this.currentLot = {
      auctionId: '',
      lot: {
        id: '',
        title: '',
        description: '',
        startPrice: 0,
        increment: 0,
        media: [],
      },
    };
  }

  async handleConnection(client: Socket) {
    try {
      // Extract the token from the Authorization header
      const token = client.handshake.auth?.token?.split(' ')[1];
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      console.log('THE TOKEN: ', token);

      // Verify the token
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      console.log('JWT payload:', payload);
      console.log('Token expiration (exp):', new Date(payload.exp * 1000));
      client.data.user = payload; // Attach user data to the client

      console.log(`Client connected: ${payload.id}`);
    } catch (error) {
      console.error('Connection rejected:', error.message);
      client.disconnect(); // Disconnect unauthorized clients
    }
  }

  handleDisconnect(client: Socket) {
    for (const [auctionId, clients] of Object.entries(this.auctionRooms)) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        console.log(`Client ${client.id} left auction ${auctionId}`);
        this.server
          .to(auctionId)
          .emit('userLeft', { clientId: client.id, auctionId });

        const user = client.data.user;
        if (user.role === 'admin') {
          this.resetAuctionData();
          // Notify all clients in the room
          this.server.to(auctionId).emit('auctionStopped', {
            auctionId,
            message: 'Auction has been stopped',
          });
        }
        if (clients.size === 0) {
          delete this.auctionRooms[auctionId]; // Cleanup empty rooms
        }
        break;
      }
    }
  }

  // Auction Manager: Start Video Stream
  @SubscribeMessage('startStream')
  async handleStartStream(client: any, payload: any) {
    console.log('Start stream requested:', payload);
  }

  // Auction Manager: Stop Video Stream
  @SubscribeMessage('stopStream')
  handleStopStream(
    @MessageBody() { auctionId }: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can stop a stream');
    }

    // Notify all clients in the room
    client
      .to(auctionId)
      .emit('streamStopped', { auctionId, message: 'Stream has been stopped' });

    this.auctionRooms[auctionId].clear();

    client.leave(auctionId);
  }

  // Auction Manager: Stop Video Stream
  @SubscribeMessage('stopAuction')
  handleStopAuction(
    @MessageBody() { auctionId }: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can stop a auctions');
    }

    // Notify all clients in the room
    this.server.to(auctionId).emit('auctionStopped', {
      auctionId,
      message: 'Auction has been stopped',
    });

    this.auctionRooms[auctionId].clear();
    this.resetAuctionData();

    client.leave(auctionId);
  }

  // Auction Manager: Stream Video Chunks
  @SubscribeMessage('streamData')
  handleStreamData(
    @MessageBody() data: Buffer,
    @ConnectedSocket() client: Socket,
  ) {
    console.warn(
      'The `streamData` event is now deprecated. Use WebRTC instead.',
    );
  }

  // Auction Manager: Send Images or Pre-recorded Videos
  @SubscribeMessage('updateMedia')
  handleSendMedia(
    @MessageBody()
    {
      auctionId,
      media,
    }: {
      auctionId: string;
      media: StaticMedia;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can send media');
    }
    this.currentMedia = { auctionId, media };
    console.log(`Received Media for auction ${auctionId}`);
    client.to(auctionId).emit('mediaUpdated', { media }); // Send media to clients
  }

  // Auction Manager: Send Images or Pre-recorded Videos
  @SubscribeMessage('updateLot')
  handleSendLot(
    @MessageBody()
    {
      auctionId,
      lot,
    }: {
      auctionId: string;
      lot: AuctionLot;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can change lots');
    }
    this.currentLot = { auctionId, lot };
    this.bidsList = [];
    this.currentBid = {
      auctionId: '',
      username: '',
      bidAmount: 0,
    };
    this.currentMedia = { auctionId, media: lot.media[0] };
    console.log(`Received Lot for auction ${auctionId}`);
    this.server.to(auctionId).emit('lotUpdated', { lot }); // Send media to clients
  }

  // Handle 'requestInitialData' event
  @SubscribeMessage('requestInitialData')
  handleGetInitialData(
    @MessageBody()
    {
      auctionId,
    }: {
      auctionId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.auctionRooms[auctionId]) {
      console.error(`No clients found in auction room ${auctionId}`);
      return;
    }

    const currentMedia = this.currentMedia.media;
    this.server.to(auctionId).emit('initialData', {
      currentBid: this.currentBid,
      bidHistory: this.bidsList,
      currentMedia,
      client: client.id,
      lot: this.currentLot,
    }); // Send media to clients
  }

  // Client: Place Bid
  @SubscribeMessage('placeBid')
  handlePlaceBid(
    @MessageBody()
    { bid, auctionId }: { bid: auctionBid; auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = client.data.user;
      if (!user) {
        throw new UnauthorizedException('You must be logged in to place a bid');
      }

      if (!this.auctionRooms[auctionId]) {
        console.error(`No clients found in auction room ${auctionId}`);
        return;
      }

      this.bidsList.push(bid);
      this.currentBid = bid;

      this.server.to(auctionId).emit('bidUpdated', {
        bidList: this.bidsList,
        currentBid: this.currentBid,
      });
    } catch (error) {
      console.log('Error emitting Bid Update event: ', error);
    }
  }

  // Auction Manager: Start Timer
  @SubscribeMessage('startTimer')
  handleStartTimer(
    @MessageBody()
    { auctionId, duration }: { auctionId: string; duration: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.auctionRooms[auctionId]) {
      console.error(`No clients found in auction room ${auctionId}`);
      return;
    }

    let remainingTime = duration;

    const interval = setInterval(() => {
      remainingTime -= 1;

      // Emit to all clients in the room using `this.server`
      this.server.to(auctionId).emit('timerUpdate', { remainingTime });

      if (remainingTime <= 0) {
        clearInterval(interval);
        this.server
          .to(auctionId)
          .emit('auctionEnded', { message: 'Auction ended' });
      }
    }, 1000);

    // Store the timer for reset or clearing
    this.auctionTimers[auctionId] = interval;
  }

  // Auction Manager: Reset Timer
  @SubscribeMessage('resetTimer')
  handleResetTimer(
    @MessageBody()
    { auctionId }: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can reset the timer');
    }

    if (this.auctionTimers[auctionId]) {
      clearInterval(this.auctionTimers[auctionId]); // Clear the existing timer
    }

    // Restart the timer with 15 seconds
    let remainingTime = 15;

    const interval = setInterval(() => {
      remainingTime -= 1;

      // Emit the remaining time to clients
      this.server.to(auctionId).emit('timerUpdate', { remainingTime });

      if (remainingTime <= 0) {
        clearInterval(interval);
        this.server
          .to(auctionId)
          .emit('auctionEnded', { message: 'Auction ended' });
        delete this.auctionTimers[auctionId];
      }
    }, 1000);

    // Save the new timer
    this.auctionTimers[auctionId] = interval;

    // Notify the admin that the timer has been reset
    client.emit('timerReset', {
      message: 'Timer reset to 15 seconds',
      duration: 15,
    });
  }

  @SubscribeMessage('joinAuction')
  async handleJoinAuction(
    @MessageBody() { auctionId }: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(auctionId);

    if (!this.auctionRooms[auctionId]) {
      this.auctionRooms[auctionId] = new Set();
    }
    this.auctionRooms[auctionId].add(client.id);
    console.log(`Client ${client.id} joined auction ${auctionId}`);

    // Notify the joining client
    this.server.emit('auctionJoined', { clientId: client.id, auctionId });

    // Optionally notify others in the room
    this.server
      .to(auctionId)
      .emit('userJoined', { clientId: client.id, auctionId });

    console.log(
      `Welcome message emitted to room: ${auctionId} for client: ${client.id}`,
    );
  }

  private resetAuctionData = () => {
    this.currentBid = {
      auctionId: '',
      username: '',
      bidAmount: 0,
    };
    this.currentMedia = {
      auctionId: 'auction123',
      media: {
        id: 1,
        type: 'image',
        url: '/media/no_media.gif',
        description: 'Descripcion Camion 1',
      },
    };
    this.currentLot = {
      auctionId: '',
      lot: {
        id: '',
        title: '',
        description: '',
        startPrice: 0,
        increment: 0,
        media: [],
      },
    };
  };

}
