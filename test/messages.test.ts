// Parity with the builders the ONRANK app uses: test/fixtures/app-messages.json is generated from the app's own
// app/src/lib/tx/messages.ts (test/gen-app-fixtures.mts). Same destination, same value, same body BoC — bit for bit.
import { Address, Cell } from "@ton/core";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/app-messages.json";
import { CASES } from "./parity-cases.js";
import { Gas, Op, applySlippage, buildCurveBuy, buildPoolBuy, buildPoolSellV1, buildSell, defaultQueryId } from "../src/index.js";

const A = (s: string) => (s.includes(":") ? Address.parseRaw(s) : Address.parse(s));
const curve = A(CASES.curve), pool = A(CASES.pool), wallet = A(CASES.wallet), owner = A(CASES.owner);
const q = BigInt(CASES.queryId);
type Msg = { address: string; amount: string; payload: string };
const same = (a: Msg, b: Msg) => {
  expect(Address.parse(a.address).equals(Address.parse(b.address))).toBe(true);
  expect(a.amount).toBe(b.amount);
  expect(a.payload).toBe(b.payload);
};
const F = fixture.messages;

describe("parity with the app builders (fixture generated from the app)", () => {
  it("curve buy", () => same(buildCurveBuy({ curve, tonIn: BigInt(CASES.curveBuy.tonIn), minOut: BigInt(CASES.curveBuy.minOut), queryId: q }), F.curveBuy));
  it("pool buy v2 / v1", () => {
    same(buildPoolBuy({ pool, tonIn: BigInt(CASES.poolBuy.tonIn), minOut: BigInt(CASES.poolBuy.minOut), queryId: q, version: 2 }), F.poolBuyV2);
    same(buildPoolBuy({ pool, tonIn: BigInt(CASES.poolBuy.tonIn), minOut: BigInt(CASES.poolBuy.minOut), queryId: q, version: 1 }), F.poolBuyV1);
  });
  it("sell (curve or v2 pool) v2 / v1", () => {
    same(buildSell({ rewardWallet: wallet, owner, coinAmount: BigInt(CASES.sell.coinAmount), minTon: BigInt(CASES.sell.minTon), queryId: q, version: 2 }), F.sellV2);
    same(buildSell({ rewardWallet: wallet, owner, coinAmount: BigInt(CASES.sell.coinAmount), minTon: BigInt(CASES.sell.minTon), queryId: q, version: 1 }), F.sellV1);
    same(buildSell({ rewardWallet: wallet, owner, coinAmount: BigInt(CASES.poolSell.coinAmount), minTon: BigInt(CASES.poolSell.minTon), queryId: q, version: 2 }), F.poolSellV2);
  });
  it("v1 pool sell (TEP-74 transfer)", () => same(buildPoolSellV1({ rewardWallet: wallet, pool, owner, coinAmount: BigInt(CASES.poolSell.coinAmount), minTon: BigInt(CASES.poolSell.minTon), queryId: q }), F.poolSellV1));
  it("constants match", () => {
    expect(Op.Buy).toBe(fixture.constants.Buy);
    expect(Op.SwapTonForCoin).toBe(fixture.constants.SwapTonForCoin);
    expect(Op.Burn).toBe(fixture.constants.AskToBurn);
    expect(Op.SellIntent).toBe(fixture.constants.SellIntent);
    expect(Gas.curveBuy.toString()).toBe(fixture.constants.curveBuy);
    expect(Gas.poolSwapV2.toString()).toBe(fixture.constants.poolSwapV2);
    expect(Gas.walletBurnV2.toString()).toBe(fixture.constants.walletBurnV2);
    expect(Gas.margin.toString()).toBe(fixture.constants.margin);
  });
});

describe("layouts", () => {
  it("curve buy body: op, queryId, minOut, null recipient; value = tonIn + BUY_GAS", () => {
    const m = buildCurveBuy({ curve, tonIn: 10n ** 9n, minOut: 5n, queryId: q });
    const s = Cell.fromBase64(m.payload).beginParse();
    expect(s.loadUint(32)).toBe(Op.Buy);
    expect(s.loadUintBig(64)).toBe(q);
    expect(s.loadCoins()).toBe(5n);
    expect(s.loadMaybeAddress()).toBeNull();
    expect(s.remainingBits).toBe(0);
    expect(m.amount).toBe((10n ** 9n + Gas.curveBuy).toString());
  });
  it("sell body: TEP-74 burn with SellIntent ref", () => {
    const m = buildSell({ rewardWallet: wallet, owner, coinAmount: 77n, minTon: 6n, queryId: q });
    const s = Cell.fromBase64(m.payload).beginParse();
    expect(s.loadUint(32)).toBe(Op.Burn);
    expect(s.loadUintBig(64)).toBe(q);
    expect(s.loadCoins()).toBe(77n);
    expect(s.loadAddress().equals(owner)).toBe(true);
    const intent = s.loadRef().beginParse();
    expect(intent.loadUint(32)).toBe(Op.SellIntent);
    expect(intent.loadCoins()).toBe(6n);
    expect(m.amount).toBe((Gas.walletBurnV2 + Gas.margin).toString());
  });
  it("refuses trades without slippage protection or with empty amounts", () => {
    expect(() => buildCurveBuy({ curve, tonIn: 10n ** 9n, minOut: 0n })).toThrow(/minOut/);
    expect(() => buildPoolBuy({ pool, tonIn: 0n, minOut: 1n })).toThrow(/tonIn/);
    expect(() => buildSell({ rewardWallet: wallet, owner, coinAmount: 1n, minTon: 0n })).toThrow(/minTon/);
  });
  it("default query ids are 64-bit and distinct", () => {
    const a = defaultQueryId(), b = defaultQueryId();
    expect(a).toBeLessThan(1n << 64n);
    expect(a === b).toBe(false);
    expect(applySlippage(100n, 0)).toBe(100n);
  });
});
