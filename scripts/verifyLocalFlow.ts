import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createPublicClient, defineChain, getAddress, http, keccak256, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi } from "../src/blockchain/abi.js";
import { createChainClientFromEnv } from "../src/blockchain/client.js";

const brandKey = "0x59c6995e998f97a5a0044966f094538b7dc0bfc9c534c13181d3137555c99e0d" as Hex;
const creatorKey = "0x5de4111afa1baadb3186ed53779472626580c78aa5c85641590ce8b55b6c2411" as Hex;
const brand = privateKeyToAccount(brandKey).address;
const creator = privateKeyToAccount(creatorKey).address;
const chainClient = createChainClientFromEnv();
if (!chainClient?.defaultTokenAddress || !chainClient.prepareLocalSponsorWallet) throw new Error("A deployed local Anvil configuration is required.");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chain = defineChain({ id: 31337, name: "Anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const agreementId = `anvil-e2e-${randomUUID()}`;
const token = getAddress(chainClient.defaultTokenAddress) as Address;
const cap = 120_000_000n;
await chainClient.prepareLocalSponsorWallet({ walletAddress: brand, privateKey: brandKey, minimumTokenAmount: cap.toString() });
const before = await balance(creator);
await chainClient.createEscrow({ agreementId, brand, creator, token, totalCapAmount: cap.toString(), termsHash: keccak256(toBytes("e2e-terms")), refundAfter: Math.floor(Date.now() / 1000) + 86_400 });
await checkpoint("promo", 10_000_000n, "promo-file");
await checkpoint("final_cut", 20_000_000n, "final-file");
await chainClient.recordPublicationAndRelease({ agreementId, artifactHash: keccak256(toBytes("final-file")), payoutId: "publication", amount: "60000000", refundAfter: Math.floor(Date.now() / 1000) + 30 * 86_400 });
await expectDelta(90_000_000n, "publication");
await chainClient.releasePayout({ agreementId, payoutId: "retention", amount: "10000000" });
await expectDelta(100_000_000n, "retention");
await chainClient.releasePayout({ agreementId, payoutId: "performance-final", amount: "20000000" });
await expectDelta(cap, "performance");
console.log(JSON.stringify({ agreementId, escrowAddress: chainClient.escrowAddress, tokenAddress: token, creator, verifiedBalanceIncrease: cap.toString() }, null, 2));

async function checkpoint(name: string, amount: bigint, artifact: string) {
  await chainClient!.approveCheckpointAndRelease({ agreementId, checkpoint: name, artifactHash: keccak256(toBytes(artifact)), payoutId: name, amount: amount.toString() });
  await expectDelta(name === "promo" ? 10_000_000n : 30_000_000n, name);
}
async function balance(address: Address) { return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }); }
async function expectDelta(expected: bigint, step: string) { const actual = (await balance(creator)) - before; if (actual !== expected) throw new Error(`${step}: expected creator delta ${expected}, received ${actual}`); }
