import { Test, TestingModule } from '@nestjs/testing';
import { AuctionGateway } from './auction.gateway';

describe('AuctionGateway', () => {
  let gateway: AuctionGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuctionGateway],
    }).compile();

    gateway = module.get<AuctionGateway>(AuctionGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
