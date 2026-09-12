// The SDK formulas must reproduce the contracts' get-methods exactly. Fixture = live $RANK curve state and the
// on-chain `get_buy_quote` / `get_sell_quote` answers captured in the same minute (test/fixtures).
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/rank-curve-2026-09-12.json";
import { Gas, applySlippage, isCurveOpen, quoteCurveBuy, quoteCurveBuyForTonIn, quoteCurveSell, quotePoolBuy, quotePoolSell, spotPriceNano, type CurveState, type PoolState } from "../src/index.js";

const state: CurveState = { state: fixture.state, virtualTon: BigInt(fixture.virtualTon), virtualToken: BigInt(fixture.virtualToken), realTon: BigInt(fixture.realTon), sold: BigInt(fixture.sold), pool: null };

describe("curve quotes vs on-chain get-methods", () => {
  it("get_buy_quote for 1, 5, 25 and 300 TON attached", () => {
    for (const [attached, expected] of Object.entries(fixture.buys)) {
      const q = quoteCurveBuy(state, BigInt(attached));
      expect(q.amountOut.toString()).toBe(expected.amountOut);
      expect(q.fee.toString()).toBe(expected.fee);
    }
  });
  it("get_sell_quote for three sizes", () => {
    for (const [coinIn, expected] of Object.entries(fixture.sells)) {
      const q = quoteCurveSell(state, BigInt(coinIn));
      expect(q.amountOut.toString()).toBe(expected.amountOut);
      expect(q.fee.toString()).toBe(expected.fee);
    }
  });
  it("attached ≤ BUY_GAS → nothing; tonIn helper adds the gas", () => {
    expect(quoteCurveBuy(state, Gas.curveBuy)).toEqual({ amountOut: 0n, fee: 0n });
    expect(quoteCurveBuyForTonIn(state, 5_000_000_000n - Gas.curveBuy)).toEqual(quoteCurveBuy(state, 5_000_000_000n));
  });
  it("last lot: a buy larger than what is left takes exactly the remaining coins", () => {
    const remaining = 800_000_000n * 1_000_000_000n - state.sold;
    const q = quoteCurveBuy(state, 10_000n * 1_000_000_000n);
    expect(q.amountOut).toBe(remaining);
    expect(q.fee).toBeGreaterThan(0n);
  });
  it("open / graduated", () => {
    expect(isCurveOpen(state)).toBe(true);
    expect(isCurveOpen({ ...state, pool: "EQ..." })).toBe(false);
    expect(isCurveOpen({ ...state, state: 2 })).toBe(false);
  });
  it("spot price = virtualTon / virtualToken per whole coin", () => {
    expect(spotPriceNano(state)).toBe((state.virtualTon * 1_000_000_000n) / state.virtualToken);
  });
});

describe("pool quotes (PoolV2 formulas)", () => {
  const pool: PoolState = { reserveTon: 1_468_500_000_000n, reserveCoin: 200_000_000n * 1_000_000_000n, lpFeeBps: 100, protocolFeeBps: 100, volumeTon: 0n, nonce: 0n, master: "x", splitter: "y" };
  it("buy: 1 % LP + 1 % protocol on the way in, constant product on the net", () => {
    const tonIn = 10_000_000_000n;
    const q = quotePoolBuy(pool, tonIn);
    const net = tonIn - 100_000_000n - 100_000_000n;
    expect(q.fee).toBe(200_000_000n);
    expect(q.amountOut).toBe((pool.reserveCoin * net) / (pool.reserveTon + net));
  });
  it("sell: fees on the gross TON out", () => {
    const coinIn = 1_000_000n * 1_000_000_000n;
    const gross = (pool.reserveTon * coinIn) / (pool.reserveCoin + coinIn);
    const q = quotePoolSell(pool, coinIn);
    expect(q.fee).toBe((gross * 100n) / 10_000n + (gross * 100n) / 10_000n);
    expect(q.amountOut).toBe(gross - q.fee);
  });
  it("empty pool → 0", () => {
    expect(quotePoolBuy({ ...pool, reserveCoin: 0n }, 10n ** 9n).amountOut).toBe(0n);
    expect(quotePoolSell({ ...pool, reserveCoin: 0n }, 10n ** 9n)).toEqual({ amountOut: 0n, fee: 0n });
  });
  it("graduation price continuity: pool spot == curve spot at sell-out", () => {
    // at sell-out the curve holds virtualTon0 + collected and virtualToken0 − 800 M; the pool gets (collected − 26) / 200 M
    const vt0 = 510n * 10n ** 9n, vk0 = 1_073_000_000n * 10n ** 9n, sold = 800_000_000n * 10n ** 9n;
    const collected = (vt0 * sold + (vk0 - sold) - 1n) / (vk0 - sold); // tonInFor(800 M) from a fresh curve
    const curvePrice = ((vt0 + collected) * 10n ** 9n) / (vk0 - sold);
    const poolPrice = ((collected - 26n * 10n ** 9n) * 10n ** 9n) / (200_000_000n * 10n ** 9n);
    expect(Number(poolPrice) / Number(curvePrice)).toBeCloseTo(1, 2);
  });
});

describe("applySlippage", () => {
  it("floors and validates", () => {
    expect(applySlippage(1_000_000n, 200)).toBe(980_000n);
    expect(applySlippage(999n, 100)).toBe(989n);
    expect(() => applySlippage(1n, 10_000)).toThrow();
    expect(() => applySlippage(1n, -1)).toThrow();
  });
});
