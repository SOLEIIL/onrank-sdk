// Unsigned messages, ready for TON Connect `sendTransaction({ messages: [msg] })`. Pure functions: no network, no keys.
// Layouts mirror the contracts (contracts/contracts/launcher-v2/*.tolk) bit for bit.
import { Address, Cell, beginCell } from "@ton/core";
import { Gas, Op, type LauncherVersion } from "./constants.js";

/** What a wallet expects: destination, nanoTON to attach (decimal string), base64 BoC body. */
export type TonConnectMessage = { address: string; amount: string; payload: string };

const boc = (c: Cell) => c.toBoc().toString("base64");
const msg = (to: Address, amount: bigint, body: Cell): TonConnectMessage => ({ address: to.toString({ bounceable: true }), amount: amount.toString(), payload: boc(body) });

/** Any 64-bit query id; the default is time-based, good enough to tell transactions apart in a wallet history. */
export function defaultQueryId(): bigint {
  return (BigInt(Date.now()) << 20n) | BigInt(Math.floor(Math.random() * 0xfffff));
}

/**
 * Buy on the curve. `tonIn` is what gets swapped; the message attaches `tonIn + Gas.curveBuy`.
 * `minOut`: minimum coins accepted (quote × (1 − slippage)); the curve refunds everything below it (exit 479).
 * `recipient` defaults to the signer — leave it unset unless you intentionally buy for someone else.
 */
export function buildCurveBuy(p: { curve: Address; tonIn: bigint; minOut: bigint; queryId?: bigint; recipient?: Address }): TonConnectMessage {
  if (p.tonIn <= 0n) throw new Error("tonIn must be > 0");
  if (p.minOut <= 0n) throw new Error("minOut must be > 0 (never trade without slippage protection)");
  const body = beginCell().storeUint(Op.Buy, 32).storeUint(p.queryId ?? defaultQueryId(), 64).storeCoins(p.minOut).storeAddress(p.recipient ?? null).endCell();
  return msg(p.curve, p.tonIn + Gas.curveBuy, body);
}

/** Buy on the pool after graduation. Attaches `tonIn + SWAP_GAS` (0.15 TON on v2, 0.2 on v1). */
export function buildPoolBuy(p: { pool: Address; tonIn: bigint; minOut: bigint; queryId?: bigint; version?: LauncherVersion }): TonConnectMessage {
  if (p.tonIn <= 0n) throw new Error("tonIn must be > 0");
  if (p.minOut <= 0n) throw new Error("minOut must be > 0 (never trade without slippage protection)");
  const body = beginCell().storeUint(Op.SwapTonForCoin, 32).storeUint(p.queryId ?? defaultQueryId(), 64).storeCoins(p.minOut).endCell();
  return msg(p.pool, p.tonIn + ((p.version ?? 2) === 2 ? Gas.poolSwapV2 : Gas.poolSwapV1), body);
}

/**
 * Sell on the curve **or** the v2 pool: a burn on the owner's RewardWallet with a SellIntent. The master routes it to
 * whichever market is live and pays `owner` in TON; a refused sale re-mints the coins to `owner`.
 * `rewardWallet` = `get_wallet_address(owner)` on the coin's master. `minTon`: minimum TON accepted.
 */
export function buildSell(p: { rewardWallet: Address; owner: Address; coinAmount: bigint; minTon: bigint; queryId?: bigint; version?: LauncherVersion }): TonConnectMessage {
  if (p.coinAmount <= 0n) throw new Error("coinAmount must be > 0");
  if (p.minTon <= 0n) throw new Error("minTon must be > 0 (never trade without slippage protection)");
  const intent = beginCell().storeUint(Op.SellIntent, 32).storeCoins(p.minTon).endCell();
  const body = beginCell().storeUint(Op.Burn, 32).storeUint(p.queryId ?? defaultQueryId(), 64).storeCoins(p.coinAmount).storeAddress(p.owner).storeMaybeRef(intent).endCell();
  return msg(p.rewardWallet, ((p.version ?? 2) === 2 ? Gas.walletBurnV2 : Gas.walletBurnV1) + Gas.margin, body);
}

/**
 * v1 pool sell only (legacy coins): TEP-74 transfer of the coins to the pool with a SwapCoinForTon forward payload.
 * v2 pools take `buildSell` instead.
 */
export function buildPoolSellV1(p: { rewardWallet: Address; pool: Address; owner: Address; coinAmount: bigint; minTon: bigint; queryId?: bigint }): TonConnectMessage {
  if (p.coinAmount <= 0n) throw new Error("coinAmount must be > 0");
  if (p.minTon <= 0n) throw new Error("minTon must be > 0");
  const swap = beginCell().storeUint(Op.SwapCoinForTon, 32).storeCoins(p.minTon).endCell();
  const body = beginCell()
    .storeUint(Op.Transfer, 32)
    .storeUint(p.queryId ?? defaultQueryId(), 64)
    .storeCoins(p.coinAmount)
    .storeAddress(p.pool)
    .storeAddress(p.owner)
    .storeMaybeRef(null)
    .storeCoins(Gas.poolSellForward)
    .storeMaybeRef(swap)
    .endCell();
  return msg(p.rewardWallet, Gas.poolSellForward + Gas.walletTransfer + Gas.margin, body);
}

/** `quote × (10000 − slippageBps) / 10000`, floored — the value to pass as minOut / minTon. */
export function applySlippage(quote: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) throw new Error("slippageBps must be an integer in [0, 10000)");
  return (quote * BigInt(10_000 - slippageBps)) / 10_000n;
}
