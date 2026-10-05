/** Opcodes of the messages an integrator sends (launcher v2 contracts; v1 shares them). */
export const Op = {
  /** Curve: buy with the attached TON minus BUY_GAS. */
  Buy: 0x43550002,
  /** Pool: buy with the attached TON minus SWAP_GAS. */
  SwapTonForCoin: 0x504f0001,
  /** v1 pool only: forward payload of a TEP-74 transfer to the pool. */
  SwapCoinForTon: 0x504f0002,
  /** TEP-74 transfer (v1 pool sell). */
  Transfer: 0x0f8a7ea5,
  /** TEP-74 burn on the user's RewardWallet — with a SellIntent payload it is a sale. */
  Burn: 0x595f07bc,
  /** Burn custom payload: sell for at least `minTon`. */
  SellIntent: 0x52570018,
} as const;

/** Gas the contracts require (nanoTON). Excess is refunded by the contracts; a margin costs nothing. */
export const Gas = {
  /** Curve.BUY_GAS — deducted from the attached value before the swap. */
  curveBuy: 150_000_000n,
  /** Pool.SWAP_GAS (v1). */
  poolSwapV1: 200_000_000n,
  /** PoolV2.SWAP_GAS. */
  poolSwapV2: 150_000_000n,
  /** RewardWallet.WALLET_BURN_GAS (v1). */
  walletBurnV1: 120_000_000n,
  /** RewardWalletV2.WALLET_BURN_GAS. */
  walletBurnV2: 160_000_000n,
  /** RewardWallet.WALLET_TRANSFER_GAS (v1 pool sell). */
  walletTransfer: 100_000_000n,
  /** v1 pool sell: forward TON so a refused sale can return the coins. */
  poolSellForward: 150_000_000n,
  /** Safety margin added on sells (refunded). */
  margin: 30_000_000n,
} as const;

/** Exit codes worth showing to a user (contracts/common/errors.tolk). */
export const ExitCode = {
  NotFromOwner: 402,
  InsufficientValue: 410,
  BudgetExceeded: 451,
  SettleInFlight: 476,
  CurveNotOpen: 478,
  SlippageExceeded: 479,
  BelowMinTrade: 480,
  PoolEmpty: 491,
} as const;

/** Event topics (248-bit value in the external out-message destination). */
export const Topic = {
  LaunchCreated: 0x4641e001n,
  CurveTrade: 0x4355e001n,
  CurveGraduated: 0x4355e002n,
  PoolSwap: 0x504fe001n,
  PoolRefund: 0x504fe002n,
  FeeSplit: 0x4653e001n,
} as const;

/** Mainnet core accounts (also served live by GET https://onrank.lol/api/config). */
export const MAINNET = {
  factory: "EQB18IIqz56m9AAwNpX0Ai61_LNa4yquhT3QRNk4geiLwdhA",
  pot: "EQCpS9EiKrk0W7pCEybeKiCbzLL1b-CSTeiHHgVGKCQD5Mc1",
  potRelay: "EQBv-rQifdeTG6AMWw9OEp9x9YLEBGs__tkWj5sy8ulgiOFT",
  minter: "EQBxJR0SBPpr7H35SfZD9b2AZHLfX2SJyUYNMWNpXq3vvAYU",
  collection: "EQBKCClSs3RhzCXqQrLf8uyUPUBuCmU4P4YGY51tJyNMYgMe",
  buyback: "EQBtLFO9DvXI6WV0uraqVWu6qH8o7gQbk6Awfxg7Kj8Z_phO",
  /** Public launches since 2026-10-05 (graduation to a locked DeDust pool). */
  factoryDex: "EQAqiT8mgpzHsRQ6dcfMB5zOqdDicsll59tPVKOoY5xSX05Y",
  gasStation: "EQCdG8p4dxN126sgk0b-_0P0DFuQ9npju9Eq6hzWqKGma5bt",
  usdt: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  api: "https://onrank.lol",
} as const;

/** Code hashes (base64) of the deployed v2 contracts — compare before trusting an address. */
export const CODE_HASH = {
  FactoryV2: "UhyECvtffP/+4hoszJv5w2jH21HAO81k0g4e78RWqBk=",
  CurveV2: "x1+u3TP0Q7h7k/X9GByNy6WqOCvnJ4KVL1hR7t2tWcM=",
  PoolV2: "4yPKye3U58+n21m6EC5vdwvii5A10umUOjjR2elP9t8=",
  RewardMasterV2: "XSZIxXypgXYGEwADqjEcTRTu9mXqu1xb+z7Vu/3fjBw=",
  RewardWalletV2: "qahjc6e276BatQUKZ9wJ4iuKe6Crnv0FbCXcSR+Kr+A=",
  FeeSplitterV2: "5cXxuRBVXd5tEU3TKojemQ9zzEEwo1hpLnkjnCiDSO4=",
  RewardVaultV2: "vzEyUk5gEDQxHIfokjDqvgmuwFsOQnnKwpyBrIVRE/A=",
  Pot: "lxv0tCBCh1oQk0f5oBU0KCTmebivPtMicSoSp5h4Phw=",
  PotRelay: "h7MamCDtM7iPXwEquvm5JaSgCAHLgf3EkVq8Y7Zz2tY=",
  DeskMinter: "9eaThD65MUwYDWixklg8EXyLE2LSKjE0YSY+KhN8PXg=",
  DeskCollection: "LHhgnY0QJjXpBWNkpYjjCJK1elxludK0gBHdLq4IYeU=",
  BuybackVault: "WXP9MVAA2AT/dITksu2ewZGJo9hdBlV7LAeG/s6C9Xo=",
  // launcher-dex (public launches since 2026-10-05)
  FactoryDex3: "vCgj4/7SZyQJWuITanh7qb8L8uaKmkJ/r+CS6vnjda8=",
  CurveDex2: "JQmaYwoR5eFLfn0KxffhMPZkGPkw0XUoFGnsrk+tu8M=",
  GasStation: "u3BLYqRJfpcmBX1KceV7Gku/WwJXPdOMuvyPPGAnblk=",
  CreatorFee: "58nQm1TTF93/WasUb27nGi7f06Qp8jquLtCvHGUHXMU=",
  RewardMasterDex: "nYrRvKweQHE08AuI+3qHLCwUGuByiV0OGAhgLI/TUDE=",
  RewardWalletDex: "4Wb+N/pAOREjAp2jlT1COdBvMm833i6wvF8HdmfAF+w=",
  RewardVaultDex: "5itX4gie3tJMr29uUZYKLICBUzaZhAUiQTCQLe3T5WI=",
} as const;

/** Launcher family of a coin: v1 coins are sell-only and use a different pool sell path. */
export type LauncherVersion = 1 | 2;
