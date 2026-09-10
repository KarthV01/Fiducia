import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { FakeChainClient, FakePrisma } from "./support/fakes.js";

describe("agreement API flow", () => {
  let prisma: FakePrisma;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let chain: FakeChainClient;

  beforeAll(async () => {
    prisma = new FakePrisma();
    chain = new FakeChainClient();
    app = await buildApp({
      prisma: prisma.asPrisma(),
      chain,
      logger: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("creates, accepts, funds, and releases simulated metric bonuses idempotently", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/agreements",
      payload: {
        deliverableDescription: "Creator publishes one sponsored integration.",
        deadline: "2026-09-30T00:00:00.000Z",
        totalCapAmount: "2500000000",
        participants: {
          brand: {
            walletAddress: "0x1111111111111111111111111111111111111111",
          },
          creator: {
            walletAddress: "0x2222222222222222222222222222222222222222",
          },
        },
        payouts: [
          {
            kind: "base",
            label: "Base payout",
            amount: "2000000000",
          },
          {
            kind: "bonus",
            label: "100k views",
            amount: "500000000",
            condition: {
              metricKey: "youtube.video.views",
              operator: "gte",
              threshold: "100000",
            },
          },
        ],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.status).toBe("draft");

    const acceptResponse = await app.inject({
      method: "POST",
      url: `/agreements/${created.id}/accept`,
    });

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json().status).toBe("active");
    expect(chain.createdEscrows).toHaveLength(1);

    const metricResponse = await app.inject({
      method: "POST",
      url: `/agreements/${created.id}/metrics`,
      payload: {
        metricKey: "youtube.video.views",
        value: "100000",
      },
    });

    expect(metricResponse.statusCode).toBe(200);
    expect(metricResponse.json().releasedPayoutIds).toHaveLength(1);
    expect(chain.releasedPayouts).toHaveLength(1);

    const repeatedMetricResponse = await app.inject({
      method: "POST",
      url: `/agreements/${created.id}/metrics`,
      payload: {
        metricKey: "youtube.video.views",
        value: "250000",
      },
    });

    expect(repeatedMetricResponse.statusCode).toBe(200);
    expect(repeatedMetricResponse.json().releasedPayoutIds).toHaveLength(0);
    expect(chain.releasedPayouts).toHaveLength(1);
  });
});
