/* eslint-disable prettier/prettier */
export interface StaticMedia {
    id: number;
    type: "image" | "video";
    url: string;
    description: string;
  };

export interface auctionBid {
  auctionId: string,
  username: string,
  bidAmount: number
}

export interface ClientToServerEvents {
  connectTransport: (data: { transportId: string; dtlsParameters: any }) => void;
  produce: (
    data: { transportId: string; kind: string; rtpParameters: any },
    callback: (response: { id: string }) => void
  ) => void;
  consume: (
    data: { transportId: string },
    callback: (response: { id: string; producerId: string; kind: string; rtpParameters: any }) => void
  ) => void;
}

export interface ServerToClientEvents {
  routerRtpCapabilities: (capabilities: any) => void;
  transportCreated: (transportOptions: any) => void;
  stream: (stream: MediaStream) => void;
}

export interface AuctionLot {
  id: string;
  title: string;
  description: string;
  startPrice: number;
  increment: number;
  media: StaticMedia[];
}

// Represents an auction containing multiple lots
export interface Auction {
  id: string;
  lots: AuctionLot[];
}
