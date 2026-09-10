export const sponsorshipEscrowAbi = [
  {
    type: "function",
    name: "operators",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "createEscrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agreementId", type: "bytes32" },
      { name: "brand", type: "address" },
      { name: "creator", type: "address" },
      { name: "token", type: "address" },
      { name: "totalCap", type: "uint256" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releasePayout",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agreementId", type: "bytes32" },
      { name: "payoutId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approveDeliveryAndRelease",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agreementId", type: "bytes32" },
      { name: "submissionHash", type: "bytes32" },
      { name: "payoutId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approvedDeliveryHash",
    stateMutability: "view",
    inputs: [{ name: "agreementId", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const mockUsdcAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
