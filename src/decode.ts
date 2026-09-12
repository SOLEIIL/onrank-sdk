// Decoders for get-method results and events. Get-method stacks are `TupleItem[]` as returned by @ton/ton /
// @ton/core's TupleReader (toncenter v2 `runGetMethod` stacks need the usual num/cell conversion first).
import { Address, Cell, TupleReader, type ExternalAddress, type TupleItem } from "@ton/core";
import { Topic } from "./constants.js";
import type { CurveState, PoolState } from "./quotes.js";

function optAddress(r: TupleReader): string | null {
  const item = r.peek();
  // `null`, or an empty tuple (how some RPCs render TVM null), or an addr_none slice: no address
  if (item.type === "null" || (item.type === "tuple" && item.items.length === 0)) {
    r.pop();
    return null;
  }
  if (item.type === "slice" || item.type === "cell") {
    const s = item.cell.beginParse();
    if (s.remainingBits < 267) {
      r.pop();
      return null;
    }
  }
  return r.readAddress().toString();
}

/** `get_curve_data` → the six fields the quotes need (roles / params cells are left on the stack). */
export function decodeCurveData(items: TupleItem[]): CurveState {
  const r = new TupleReader(items);
  return { state: r.readNumber(), virtualTon: r.readBigNumber(), virtualToken: r.readBigNumber(), realTon: r.readBigNumber(), sold: r.readBigNumber(), pool: optAddress(r) };
}

/** `get_pool_data`. */
export function decodePoolData(items: TupleItem[]): PoolState {
  const r = new TupleReader(items);
  return { reserveTon: r.readBigNumber(), reserveCoin: r.readBigNumber(), lpFeeBps: r.readNumber(), protocolFeeBps: r.readNumber(), volumeTon: r.readBigNumber(), nonce: r.readBigNumber(), master: r.readAddress().toString(), splitter: r.readAddress().toString() };
}

/** `get_buy_quote` / `get_sell_quote` → `(amountOut, fee)`. */
export function decodeQuote(items: TupleItem[]): { amountOut: bigint; fee: bigint } {
  const r = new TupleReader(items);
  return { amountOut: r.readBigNumber(), fee: r.readBigNumber() };
}

export type TradeEvent =
  | { kind: "CurveTrade"; isBuy: boolean; trader: string; ton: bigint; coin: bigint; fee: bigint; virtualTon: bigint; virtualToken: bigint; realTon: bigint }
  | { kind: "PoolSwap"; isBuy: boolean; trader: string; ton: bigint; coin: bigint; lpFee: bigint; protocolFee: bigint; reserveTon: bigint; reserveCoin: bigint }
  | { kind: "CurveGraduated"; pool: string; liquidityTon: bigint; liquidityCoin: bigint; protocolFee: bigint }
  | { kind: "LaunchCreated"; seq: bigint; creator: string; master: string; vault: string; splitter: string; curve: string; rewardCount: number; firstBuyTon: bigint; codeVersion: number; preminted: bigint };

/** Topic of an external out-message destination, or null when it is not an ONRANK log. */
export function topicOf(dest: ExternalAddress | null | undefined): bigint | null {
  if (!dest || dest.bits !== 256) return null;
  if (dest.value >> 248n !== 0n) return null;
  return dest.value;
}

/** Decodes the trading-relevant events; returns null for other topics. Throws on a malformed body. */
export function decodeTradeEvent(topic: bigint, body: Cell): TradeEvent | null {
  const s = body.beginParse();
  switch (topic) {
    case Topic.CurveTrade:
      return { kind: "CurveTrade", isBuy: s.loadBit(), trader: s.loadAddress().toString(), ton: s.loadCoins(), coin: s.loadCoins(), fee: s.loadCoins(), virtualTon: s.loadCoins(), virtualToken: s.loadCoins(), realTon: s.loadCoins() };
    case Topic.PoolSwap:
      return { kind: "PoolSwap", isBuy: s.loadBit(), trader: s.loadAddress().toString(), ton: s.loadCoins(), coin: s.loadCoins(), lpFee: s.loadCoins(), protocolFee: s.loadCoins(), reserveTon: s.loadCoins(), reserveCoin: s.loadCoins() };
    case Topic.CurveGraduated:
      return { kind: "CurveGraduated", pool: s.loadAddress().toString(), liquidityTon: s.loadCoins(), liquidityCoin: s.loadCoins(), protocolFee: s.loadCoins() };
    case Topic.LaunchCreated: {
      const seq = s.loadUintBig(64);
      const creator = s.loadAddress().toString();
      const addrs = s.loadRef().beginParse();
      const master = addrs.loadAddress().toString();
      const vault = addrs.loadAddress().toString();
      const more = addrs.loadRef().beginParse();
      const splitter = more.loadAddress().toString();
      const curve = more.loadAddress().toString();
      const rewardCount = s.loadUint(8);
      const firstBuyTon = s.loadCoins();
      const codeVersion = s.remainingBits >= 16 ? s.loadUint(16) : 1;
      const preminted = s.remainingBits >= 4 ? s.loadCoins() : 0n;
      return { kind: "LaunchCreated", seq, creator, master, vault, splitter, curve, rewardCount, firstBuyTon, codeVersion, preminted };
    }
    default:
      return null;
  }
}

/** Address helper: accepts raw (`0:…`) or friendly forms. */
export function parseAddress(a: string): Address {
  return a.includes(":") ? Address.parseRaw(a) : Address.parse(a);
}
