import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  maxUint256,
  parseEther,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mockUsdcAbi, sponsorshipEscrowAbi } from "./abi.js";
import { agreementKey, payoutKey } from "./ids.js";
import {
  DEFAULT_LOCAL_BACKEND_PRIVATE_KEY,
  DEFAULT_LOCAL_RPC_URL,
  LOCAL_CHAIN_ID,
  chainNameForId,
  isDefaultLocalPrivateKey,
} from "./networks.js";

export type CreateEscrowInput = {
  agreementId: string;
  brand: string;
  creator: string;
  token: string;
  totalCapAmount: string;
  termsHash: Hex;
  refundAfter: number;
};

export type ReleasePayoutInput = {
  agreementId: string;
  payoutId: string;
  amount: string;
};

export type ApproveCheckpointInput = ReleasePayoutInput & {
  checkpoint: string;
  artifactHash: Hex;
};

export type RecordPublicationInput = Omit<ApproveCheckpointInput, "checkpoint"> & { refundAfter: number };

export type PrepareLocalSponsorWalletInput = {
  walletAddress: string;
  privateKey: Hex;
  minimumTokenAmount: string;
};

export type ChainWriteResult = {
  txHash: Hex;
};

export type CreateEscrowResult = ChainWriteResult & {
  chainId: number;
  escrowAddress: Address;
  agreementKey: Hex;
};

export interface ChainClient {
  chainId: number;
  escrowAddress: Address;
  defaultTokenAddress?: Address;
  prepareLocalSponsorWallet?(input: PrepareLocalSponsorWalletInput): Promise<void>;
  createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult>;
  releasePayout(input: ReleasePayoutInput): Promise<ChainWriteResult>;
  approveCheckpointAndRelease(input: ApproveCheckpointInput): Promise<ChainWriteResult>;
  recordPublicationAndRelease(input: RecordPublicationInput): Promise<ChainWriteResult>;
  refundRemaining(agreementId: string): Promise<ChainWriteResult>;
}

export type ChainClientConfig = {
  rpcUrl: string;
  chainId: number;
  escrowAddress: Address;
  defaultTokenAddress?: Address;
  backendPrivateKey: Hex;
};

export class ViemChainClient implements ChainClient {
  public readonly chainId: number;
  public readonly escrowAddress: Address;
  public readonly defaultTokenAddress?: Address;

  private readonly publicClient: ReturnType<typeof createPublicClient>;
  // viem's dynamic-chain generics are stricter than this local-dev wrapper needs.
  private readonly walletClient: ReturnType<typeof createWalletClient> & {
    writeContract(args: unknown): Promise<Hex>;
    sendTransaction(args: unknown): Promise<Hex>;
  };
  private readonly chain: ReturnType<typeof defineChain>;
  private readonly rpcUrl: string;

  constructor(config: ChainClientConfig) {
    const chain = defineChain({
      id: config.chainId,
      name: chainNameForId(config.chainId),
      nativeCurrency: {
        decimals: 18,
        name: "Ether",
        symbol: "ETH",
      },
      rpcUrls: {
        default: {
          http: [config.rpcUrl],
        },
      },
    });

    const account = privateKeyToAccount(config.backendPrivateKey);
    this.chainId = config.chainId;
    this.escrowAddress = getAddress(config.escrowAddress);
    this.defaultTokenAddress = config.defaultTokenAddress ? getAddress(config.defaultTokenAddress) : undefined;
    this.chain = chain;
    this.rpcUrl = config.rpcUrl;
    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });
    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    }) as typeof this.walletClient;
  }

  async prepareLocalSponsorWallet(input: PrepareLocalSponsorWalletInput): Promise<void> {
    if (this.chainId !== LOCAL_CHAIN_ID) {
      throw new Error("Generated sponsor wallet provisioning is only allowed on local Anvil.");
    }

    if (!this.defaultTokenAddress) {
      throw new Error("No local token address is configured.");
    }

    const sponsor = privateKeyToAccount(input.privateKey);
    const sponsorAddress = getAddress(input.walletAddress);
    if (sponsor.address.toLowerCase() !== sponsorAddress.toLowerCase()) {
      throw new Error("Generated sponsor wallet private key does not match its address.");
    }

    const sponsorBalance = await this.publicClient.getBalance({ address: sponsorAddress });
    if (sponsorBalance < parseEther("0.05")) {
      const gasHash = await this.walletClient.sendTransaction({
        to: sponsorAddress,
        value: parseEther("1"),
      });
      await this.publicClient.waitForTransactionReceipt({ hash: gasHash });
    }

    const mintHash = await this.walletClient.writeContract({
      address: this.defaultTokenAddress,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [sponsorAddress, BigInt(input.minimumTokenAmount)],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: mintHash });

    const sponsorClient = createWalletClient({
      account: sponsor,
      chain: this.chain,
      transport: http(this.rpcUrl),
    }) as typeof this.walletClient;

    const approveHash = await sponsorClient.writeContract({
      address: this.defaultTokenAddress,
      abi: mockUsdcAbi,
      functionName: "approve",
      args: [this.escrowAddress, maxUint256],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    const key = agreementKey(input.agreementId);
    const txHash = await this.walletClient.writeContract({
      address: this.escrowAddress,
      abi: sponsorshipEscrowAbi,
      functionName: "createEscrow",
      args: [
        key,
        getAddress(input.brand),
        getAddress(input.creator),
        getAddress(input.token),
        BigInt(input.totalCapAmount),
        input.termsHash,
        input.refundAfter,
      ],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return {
      txHash,
      chainId: this.chainId,
      escrowAddress: this.escrowAddress,
      agreementKey: key,
    };
  }

  async releasePayout(input: ReleasePayoutInput): Promise<ChainWriteResult> {
    const txHash = await this.walletClient.writeContract({
      address: this.escrowAddress,
      abi: sponsorshipEscrowAbi,
      functionName: "releasePayout",
      args: [agreementKey(input.agreementId), payoutKey(input.agreementId, input.payoutId), BigInt(input.amount)],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async approveCheckpointAndRelease(input: ApproveCheckpointInput): Promise<ChainWriteResult> {
    const txHash = await this.walletClient.writeContract({
      address: this.escrowAddress,
      abi: sponsorshipEscrowAbi,
      functionName: "approveCheckpointAndRelease",
      args: [
        agreementKey(input.agreementId),
        keccak256(toBytes(input.checkpoint)),
        input.artifactHash,
        payoutKey(input.agreementId, input.payoutId),
        BigInt(input.amount),
      ],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async recordPublicationAndRelease(input: RecordPublicationInput): Promise<ChainWriteResult> {
    const txHash = await this.walletClient.writeContract({
      address: this.escrowAddress, abi: sponsorshipEscrowAbi, functionName: "recordPublicationAndRelease",
      args: [agreementKey(input.agreementId), input.artifactHash, payoutKey(input.agreementId, input.payoutId), BigInt(input.amount), input.refundAfter],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async refundRemaining(agreementId: string): Promise<ChainWriteResult> {
    const txHash = await this.walletClient.writeContract({ address: this.escrowAddress, abi: sponsorshipEscrowAbi, functionName: "refundRemaining", args: [agreementKey(agreementId)] });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
}

export function createChainClientFromEnv(): ChainClient | undefined {
  const config = resolveChainClientConfig(process.env, readLocalDeployment());
  if (!config) return undefined;

  return new ViemChainClient(config);
}

export type ChainEnv = Record<string, string | undefined>;

export type LocalDeployment = {
  rpcUrl?: string;
  chainId?: number;
  escrowAddress?: string;
  tokenAddress?: string;
};

export function resolveChainClientConfig(
  env: ChainEnv,
  localDeployment?: LocalDeployment,
): ChainClientConfig | undefined {
  const explicitChainId = envValue(env, "CHAIN_ID");
  const chainId = parseChainId(explicitChainId ?? localDeployment?.chainId?.toString() ?? LOCAL_CHAIN_ID.toString());

  if (chainId !== LOCAL_CHAIN_ID) {
    const missing = ["RPC_URL", "CHAIN_ID", "ESCROW_CONTRACT_ADDRESS", "USDC_CONTRACT_ADDRESS", "BACKEND_PRIVATE_KEY"].filter(
      (key) => !envValue(env, key),
    );

    if (missing.length > 0) {
      throw new Error(
        `Non-local chain configuration for chain ID ${chainId} requires explicit ${missing.join(", ")}.`,
      );
    }

    const backendPrivateKey = envValue(env, "BACKEND_PRIVATE_KEY") as Hex;
    if (isDefaultLocalPrivateKey(backendPrivateKey)) {
      throw new Error("Refusing to use the default Anvil private key outside the local chain.");
    }

    return {
      rpcUrl: envValue(env, "RPC_URL")!,
      chainId,
      escrowAddress: getAddress(envValue(env, "ESCROW_CONTRACT_ADDRESS")!),
      defaultTokenAddress: getAddress(envValue(env, "USDC_CONTRACT_ADDRESS")!),
      backendPrivateKey,
    };
  }

  const escrowAddress = envValue(env, "ESCROW_CONTRACT_ADDRESS") ?? localDeployment?.escrowAddress;
  const tokenAddress = envValue(env, "USDC_CONTRACT_ADDRESS") ?? localDeployment?.tokenAddress;

  if (!escrowAddress || !tokenAddress) {
    return undefined;
  }

  return {
    rpcUrl: envValue(env, "RPC_URL") ?? localDeployment?.rpcUrl ?? DEFAULT_LOCAL_RPC_URL,
    chainId,
    escrowAddress: getAddress(escrowAddress),
    defaultTokenAddress: getAddress(tokenAddress),
    backendPrivateKey: (envValue(env, "BACKEND_PRIVATE_KEY") as Hex | undefined) ?? DEFAULT_LOCAL_BACKEND_PRIVATE_KEY,
  };
}

function readLocalDeployment(): LocalDeployment | undefined {
  const path = resolve("deployments/local.json");
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as LocalDeployment;
  } catch {
    return undefined;
  }
}

function parseChainId(value: string): number {
  const chainId = Number(value);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("CHAIN_ID must be a positive integer.");
  }

  return chainId;
}

function envValue(env: ChainEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}
