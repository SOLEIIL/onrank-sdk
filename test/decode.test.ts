import { Address, beginCell } from "@ton/core";
import { describe, expect, it } from "vitest";
import { Topic, decodeCurveData, decodePoolData, decodeQuote, decodeTradeEvent, toncenterStackToTuple } from "../src/index.js";

const trader = Address.parse("EQBKCClSs3RhzCXqQrLf8uyUPUBuCmU4P4YGY51tJyNMYgMe");

describe("event decoding (layouts from EVENTS.md; agreement with the app decoder is checked in app-parity.test.ts)", () => {
  it("CurveTrade", () => {
    const body = beginCell().storeBit(1).storeAddress(trader).storeCoins(1n).storeCoins(2n).storeCoins(3n).storeCoins(4n).storeCoins(5n).storeCoins(6n).endCell();
    const sdk = decodeTradeEvent(Topic.CurveTrade, body);
    expect(sdk).toEqual({ kind: "CurveTrade", isBuy: true, trader: trader.toString(), ton: 1n, coin: 2n, fee: 3n, virtualTon: 4n, virtualToken: 5n, realTon: 6n });
  });
  it("PoolSwap and CurveGraduated", () => {
    const swap = beginCell().storeBit(0).storeAddress(trader).storeCoins(10n).storeCoins(20n).storeCoins(1n).storeCoins(1n).storeCoins(500n).storeCoins(600n).endCell();
    expect(decodeTradeEvent(Topic.PoolSwap, swap)).toMatchObject({ kind: "PoolSwap", isBuy: false, ton: 10n, coin: 20n, reserveTon: 500n, reserveCoin: 600n });
    const grad = beginCell().storeAddress(trader).storeCoins(7n).storeCoins(8n).storeCoins(9n).endCell();
    expect(decodeTradeEvent(Topic.CurveGraduated, grad)).toEqual({ kind: "CurveGraduated", pool: trader.toString(), liquidityTon: 7n, liquidityCoin: 8n, protocolFee: 9n });
  });
  it("unknown topic → null", () => {
    expect(decodeTradeEvent(0x5054e001n, beginCell().endCell())).toBeNull();
  });
});

describe("get-method stacks", () => {
  it("toncenter v2 stack → curve data", () => {
    const stack = [
      ["num", "0x1"],
      ["num", "0x11ed178d35d1"],
      ["num", "0x62a2e1f4c6cd6a73"],
      ["num", "0xa815ed35d1"],
      ["num", "0x8b9e5a5fd7a2f3ad"],
      ["null", null],
      ["cell", { bytes: beginCell().endCell().toBoc().toString("base64") }],
      ["cell", { bytes: beginCell().endCell().toBoc().toString("base64") }],
    ];
    const d = decodeCurveData(toncenterStackToTuple(stack));
    expect(d.state).toBe(1);
    expect(d.virtualTon).toBe(0x11ed178d35d1n);
    expect(d.pool).toBeNull();
  });
  it("graduated curve carries the pool address", () => {
    const stack = [["num", "0x2"], ["num", "0x1"], ["num", "0x1"], ["num", "0x0"], ["num", "0x1"], ["cell", { bytes: beginCell().storeAddress(trader).endCell().toBoc().toString("base64") }]];
    expect(decodeCurveData(toncenterStackToTuple(stack)).pool).toBe(trader.toString());
  });
  it("pool data and quotes", () => {
    const stack = [["num", "0x64"], ["num", "0xc8"], ["num", "0x64"], ["num", "0x64"], ["num", "0x0"], ["num", "0x3"], ["cell", { bytes: beginCell().storeAddress(trader).endCell().toBoc().toString("base64") }], ["cell", { bytes: beginCell().storeAddress(trader).endCell().toBoc().toString("base64") }]];
    const p = decodePoolData(toncenterStackToTuple(stack));
    expect(p).toMatchObject({ reserveTon: 100n, reserveCoin: 200n, lpFeeBps: 100, protocolFeeBps: 100, nonce: 3n, master: trader.toString() });
    expect(decodeQuote(toncenterStackToTuple([["num", "0x5"], ["num", "0x1"]]))).toEqual({ amountOut: 5n, fee: 1n });
  });
});
