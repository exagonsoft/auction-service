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
import { auctionBid, StaticMedia } from 'src/types/customTypes';
import { Client } from 'socket.io/dist/client';

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000', // Allow the frontend URL
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
  private currentMedia: { auctionId: string; media: StaticMedia };
  private auctionRooms: Record<string, Set<string>> = {};

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
        url: '/media/camion-1.jpg',
        description: 'Descripcion Camion 1',
      },
    };
  }

  private auctionTimers: Record<string, NodeJS.Timeout> = {};

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
        client
          .to(auctionId)
          .emit('userLeft', { clientId: client.id, auctionId });
        if (clients.size === 0) {
          delete this.auctionRooms[auctionId]; // Cleanup empty rooms
        }
        break;
      }
    }
  }

  // Auction Manager: Start Video Stream
  @SubscribeMessage('startStream')
  handleStartStream(
    @MessageBody() { auctionId }: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can start a stream');
    }

    client.join(auctionId);
    client.emit('streamStarted', { auctionId, message: 'Stream started' });
    console.log(`Stream started for auction ${auctionId}`);

    // Notify all clients in the auction room that the stream is starting
    client
      .to(auctionId)
      .emit('awaitingOffer', { message: 'Auctioneer is preparing the stream' });
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

    const currentMedia = {
      type: this.currentMedia.media.type,
      url: this.currentMedia.media.url,
    };
    this.server.to(auctionId).emit('initialData', {
      currentBid: this.currentBid,
      bidHistory: this.bidsList,
      currentMedia,
      client: client.id,
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
  }

  // Auction Manager: Start Timer
  @SubscribeMessage('resetTimer')
  handleResetTimer(
    @MessageBody()
    { auctionId }: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can start the timer');
    }

    if (this.auctionTimers[auctionId]) {
      clearTimeout(this.auctionTimers[auctionId]);
    }

    const interval = setInterval(() => {
      client.to(auctionId).emit('timerUpdate', { remainingTime: 0 });

      clearInterval(interval);
      client.to(auctionId).emit('auctionEnded', { message: 'Auction ended' });
      delete this.auctionTimers[auctionId];
    }, 1000);

    this.auctionTimers[auctionId] = interval;
    client.emit('timerStarted', { message: 'Timer started', duration: 0 });
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
    this.server.to(auctionId).emit('userJoined', { clientId: client.id, auctionId });

    console.log(
      `Welcome message emitted to room: ${auctionId} for client: ${client.id}`,
    );
  }

  /**
   * Handles WebRTC offer from the admin/auctioneer.
   */
  @SubscribeMessage('offer')
  handleOffer(
    @MessageBody()
    data: {
      auctionId: string;
      clientId: string;
      signalData: RTCSessionDescriptionInit;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { auctionId, clientId, signalData } = data;
    console.log(
      `Forwarding offer from auctioneer to client ${clientId} in auction ${auctionId}`,
    );

    // Forward the offer to the specific client
    this.server.to(auctionId).to(clientId).emit('offer', { auctionId, clientId, signalData });
  }

  /**
   * Handles WebRTC answer from the admin/auctioneer.
   */
  @SubscribeMessage('answer')
  handleAnswer(
    @MessageBody()
    data: {
      auctionId: string;
      clientId: string;
      signalData: RTCSessionDescriptionInit;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { auctionId, clientId, signalData } = data;
    console.log(
      `Forwarding answer from client ${clientId} to auctioneer for auction ${auctionId}`,
    );

    // Forward the answer to the auctioneer
    client.to(auctionId).emit('answer', { clientId, signalData });
  }
}
