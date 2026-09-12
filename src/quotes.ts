// Quote formulas copied from the contracts (CurveV2.tolk, PoolV2.tolk). Integer arithmetic on bigint, same rounding.
// Pin them with the fixtures in test/quotes.test.ts (live get_buy_quote / get_sell_quote results).
import { Gas } from "./constants.js";

export type Quote = { amountOut: bigint; fee: bigint };

/** What `get_curve_data` returns (first six fields; roles and params are cells). */
export type CurveState = {
  /** 1 = open (trades accepted); anything else: not opened yet or graduated */
  state: number;
  virtualTon: bigint;
  virtualToken: bigint;
  /** TON really held by the curve (what backs sells) */
  realTon: bigint;
  /** coins sold so far (out of `curveSupply`) */
  sold: bigint;
  /** set at graduation */
  pool: string | null;
};

/** Curve parameters that the formulas need (Factory defaults on mainnet: feeBps 100, curveSupply 800 M coins). */
export type CurveParams = { feeBps: number; curveSupply: bigint };

export const MAINNET_CURVE_PARAMS: CurveParams = { feeBps: 100, curveSupply: 800_000_000n * 1_000_000_000n };

const coinOut = (s: CurveState, tonIn: bigint) => (s.virtualToken * tonIn) / (s.virtualTon + tonIn);
const tonInFor = (s: CurveState, out: bigint) => {
  const num = s.virtualTon * out;
  const den = s.virtualToken - out;
  return (num + den - 1n) / den;
};
const tonOut = (s: CurveState, coinIn: bigint) => (s.virtualTon * coinIn) / (s.virtualToken + coinIn);
const feeOnNet = (net: bigint, feeBps: number) => (net * BigInt(feeBps)) / BigInt(10_000 - feeBps);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * Coins received for `tonAttached` sent to the curve (BUY_GAS is deducted here, like `get_buy_quote`).
 * Returns amountOut 0 when the attached value does not cover the gas.
 */
export function quoteCurveBuy(s: CurveState, tonAttached: bigint, params: CurveParams = MAINNET_CURVE_PARAMS): Quote {
  if (tonAttached <= Gas.curveBuy) return { amountOut: 0n, fee: 0n };
  const amountIn = tonAttached - Gas.curveBuy;
  let fee = (amountIn * BigInt(params.feeBps)) / 10_000n;
  let out = coinOut(s, amountIn - fee);
  const remaining = params.curveSupply - s.sold;
  if (out > remaining) {
    // last lot: the buyer pays exactly what those coins cost, fee included; the rest is refunded by the contract
    out = remaining;
    const net = tonInFor(s, out);
    fee = min(feeOnNet(net, params.feeBps), amountIn - net);
  }
  return { amountOut: out, fee };
}

/** Same as `quoteCurveBuy` but from the amount you want swapped (the message attaches gas on top). */
export function quoteCurveBuyForTonIn(s: CurveState, tonIn: bigint, params: CurveParams = MAINNET_CURVE_PARAMS): Quote {
  return quoteCurveBuy(s, tonIn + Gas.curveBuy, params);
}

/** Net TON received for selling `coinIn` on the curve (`get_sell_quote`). The contract also needs gross ≤ realTon. */
export function quoteCurveSell(s: CurveState, coinIn: bigint, params: CurveParams = MAINNET_CURVE_PARAMS): Quote {
  const gross = tonOut(s, coinIn);
  const fee = (gross * BigInt(params.feeBps)) / 10_000n;
  return { amountOut: gross - fee, fee };
}

/** Whether the curve can still sell: open and not graduated. */
export function isCurveOpen(s: CurveState): boolean {
  return s.state === 1 && s.pool === null;
}

/** What `get_pool_data` returns. */
export type PoolState = { reserveTon: bigint; reserveCoin: bigint; lpFeeBps: number; protocolFeeBps: number; volumeTon: bigint; nonce: bigint; master: string; splitter: string };

/** Coins received for `tonIn` (after SWAP_GAS) on the pool (`get_buy_quote`). */
export function quotePoolBuy(p: PoolState, tonIn: bigint): Quote {
  const lpFee = (tonIn * BigInt(p.lpFeeBps)) / 10_000n;
  const protocolFee = (tonIn * BigInt(p.protocolFeeBps)) / 10_000n;
  const net = tonIn - lpFee - protocolFee;
  if (p.reserveCoin === 0n) return { amountOut: 0n, fee: lpFee + protocolFee };
  return { amountOut: (p.reserveCoin * net) / (p.reserveTon + net), fee: lpFee + protocolFee };
}

/** Net TON received for `coinIn` on the pool (`get_sell_quote`). */
export function quotePoolSell(p: PoolState, coinIn: bigint): Quote {
  if (p.reserveCoin === 0n) return { amountOut: 0n, fee: 0n };
  const gross = (p.reserveTon * coinIn) / (p.reserveCoin + coinIn);
  const lpFee = (gross * BigInt(p.lpFeeBps)) / 10_000n;
  const protocolFee = (gross * BigInt(p.protocolFeeBps)) / 10_000n;
  return { amountOut: gross - lpFee - protocolFee, fee: lpFee + protocolFee };
}

/** Spot price in nanoTON per whole coin (1e9 units), from either market's reserves. */
export function spotPriceNano(s: { virtualTon: bigint; virtualToken: bigint } | { reserveTon: bigint; reserveCoin: bigint }): bigint {
  const [ton, coin] = "virtualTon" in s ? [s.virtualTon, s.virtualToken] : [s.reserveTon, s.reserveCoin];
  return coin === 0n ? 0n : (ton * 1_000_000_000n) / coin;
}
