import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  maxUint256,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mockUsdcAbi } from "../src/blockchain/abi.js";

const DEFAULT_BACKEND_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const DEFAULT_BRAND_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f094538b7dc0bfc9c534c13181d3137555c99e0d" as Hex;
const DEFAULT_CREATOR_PRIVATE_KEY =
  "0x5de4111afa1baadb3186ed53779472626580c78aa5c85641590ce8b55b6c2411" as Hex;

type FoundryArtifact = {
  abi: unknown[];
  bytecode: {
    object: Hex;
  };
};

async function readArtifact(path: string): Promise<FoundryArtifact> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as FoundryArtifact;
}

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const backendPrivateKey = (process.env.BACKEND_PRIVATE_KEY as Hex | undefined) ?? DEFAULT_BACKEND_PRIVATE_KEY;
const brandPrivateKey = (process.env.BRAND_PRIVATE_KEY as Hex | undefined) ?? DEFAULT_BRAND_PRIVATE_KEY;
const creatorPrivateKey = (process.env.CREATOR_PRIVATE_KEY as Hex | undefined) ?? DEFAULT_CREATOR_PRIVATE_KEY;
const backendAccount = privateKeyToAccount(backendPrivateKey);
const brandAccount = privateKeyToAccount(brandPrivateKey);
const creatorAccount = privateKeyToAccount(creatorPrivateKey);

const chain = defineChain({
  id: chainId,
  name: "Local Sponsorship Chain",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
});

const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

const backendClient = createWalletClient({
  account: backendAccount,
  chain,
  transport: http(rpcUrl),
});

const brandClient = createWalletClient({
  account: brandAccount,
  chain,
  transport: http(rpcUrl),
});

const mockUsdc = await readArtifact("out/MockUSDC.sol/MockUSDC.json");
const escrow = await readArtifact("out/SponsorshipEscrow.sol/SponsorshipEscrow.json");

const tokenHash = await backendClient.deployContract({
  abi: mockUsdc.abi,
  bytecode: mockUsdc.bytecode.object,
});
const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
const tokenAddress = getAddress(tokenReceipt.contractAddress as Address);

const escrowHash = await backendClient.deployContract({
  abi: escrow.abi,
  bytecode: escrow.bytecode.object,
});
const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowHash });
const escrowAddress = getAddress(escrowReceipt.contractAddress as Address);

const mintHash = await backendClient.writeContract({
  address: tokenAddress,
  abi: mockUsdcAbi,
  functionName: "mint",
  args: [brandAccount.address, 1_000_000_000_000n],
});
await publicClient.waitForTransactionReceipt({ hash: mintHash });

const brandBalance = await publicClient.getBalance({ address: brandAccount.address });
if (brandBalance < parseEther("0.05")) {
  const gasHash = await backendClient.sendTransaction({
    to: brandAccount.address,
    value: parseEther("1"),
  });
  await publicClient.waitForTransactionReceipt({ hash: gasHash });
}

const approveHash = await brandClient.writeContract({
  address: tokenAddress,
  abi: mockUsdcAbi,
  functionName: "approve",
  args: [escrowAddress, maxUint256],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });

const deployment = {
  chainId,
  rpcUrl,
  escrowAddress,
  tokenAddress,
  backendAddress: backendAccount.address,
  brandAddress: brandAccount.address,
  creatorAddress: creatorAccount.address,
};

const outputPath = resolve("deployments/local.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(JSON.stringify(deployment, null, 2));
console.log("");
console.log("Add these values to .env:");
console.log(`ESCROW_CONTRACT_ADDRESS="${escrowAddress}"`);
console.log(`USDC_CONTRACT_ADDRESS="${tokenAddress}"`);
console.log(`BACKEND_PRIVATE_KEY="${backendPrivateKey}"`);
console.log("");
console.log("Local test wallets:");
console.log(`Brand wallet: ${brandAccount.address}`);
console.log(`Creator wallet: ${creatorAccount.address}`);
