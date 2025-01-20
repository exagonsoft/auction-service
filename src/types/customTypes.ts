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
