// Optional network layer: reads on-chain state through toncenter v2 (no key needed for light use) and lists coins
// through the public ONRANK API. Everything here is read-only; the messages it returns are for the user to sign.
import { Address, Cell, beginCell, type TupleItem } from "@ton/core";
import { CODE_HASH, MAINNET, type LauncherVersion } from "./constants.js";
import { decodeCurveData, decodePoolData, parseAddress } from "./decode.js";
import { applySlippage, buildCurveBuy, buildPoolBuy, buildSell, buildPoolSellV1, type TonConnectMessage } from "./messages.js";
import { isCurveOpen, quoteCurveBuyForTonIn, quoteCurveSell, quotePoolBuy, quotePoolSell, type Quote } from "./quotes.js";

export type ApiCoin = {
  seq: string;
  symbol: string | null;
  name: string | null;
  master: string;
  curve: string;
  pool: string | null;
  version: LauncherVersion;
  sellOnly: boolean;
  /** Legacy average execution price of the latest trade. */
  lastPriceNano?: string | null;
  /** Preferred current market spot for price/MCAP displays. */
  spotPriceNano?: string | null;
  hidden?: boolean;
};

export type ClientOptions = {
  /** toncenter v2 base, default https://toncenter.com/api/v2 */
  toncenter?: string;
  /** optional toncenter API key (raises the rate limit) */
  toncenterKey?: string;
  /** ONRANK API base, default https://onrank.lol */
  api?: string;
  fetch?: typeof fetch;
};

/** toncenter v2 `runGetMethod` stack → @ton/core TupleItem[] (numbers, cells, slices, null, tuples). */
export function toncenterStackToTuple(stack: unknown[]): TupleItem[] {
  return stack.map((x): TupleItem => {
    const [kind, value] = x as [string, unknown];
    if (kind === "num") return { type: "int", value: BigInt(value as string) };
    if (kind === "cell" || kind === "slice" || kind === "builder") return { type: kind === "cell" ? "cell" : "slice", cell: Cell.fromBase64((value as { bytes: string }).bytes) };
    if (kind === "null") return { type: "null" };
    if (kind === "list" || kind === "tuple") {
      const elements = ((value as { elements?: unknown[] })?.elements ?? []) as unknown[];
      // toncenter v2 renders TVM `null` (e.g. an unset `address?` such as a curve's `pool`) as an empty list
      if (elements.length === 0) return { type: "null" };
      return { type: "tuple", items: toncenterStackToTuple(elements) };
    }
    throw new Error(`unknown stack item ${kind}`);
  });
}

export class OnrankClient {
  private readonly tc: string;
  private readonly key: string | undefined;
  private readonly api: string;
  private readonly f: typeof fetch;
  constructor(o: ClientOptions = {}) {
    this.tc = o.toncenter ?? "https://toncenter.com/api/v2";
    this.key = o.toncenterKey;
    this.api = o.api ?? MAINNET.api;
    this.f = o.fetch ?? fetch;
  }

  async runGetMethod(address: Address | string, method: string, stack: Array<["num", string]> = []): Promise<TupleItem[]> {
    const a = typeof address === "string" ? parseAddress(address) : address;
    const r = await this.f(`${this.tc}/runGetMethod`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.key ? { "X-API-Key": this.key } : {}) },
      body: JSON.stringify({ address: a.toString(), method, stack }),
    });
    const j = (await r.json()) as { ok: boolean; result?: { exit_code: number; stack: unknown[] }; error?: string };
    if (!j.ok || !j.result) throw new Error(`toncenter: ${j.error ?? r.status}`);
    if (j.result.exit_code !== 0) throw new Error(`${method}: exit ${j.result.exit_code}`);
    return toncenterStackToTuple(j.result.stack);
  }

  /** Code hash (base64) of an account, to compare with `CODE_HASH` before trusting an address. */
  async codeHash(address: Address | string): Promise<string | null> {
    const a = typeof address === "string" ? parseAddress(address) : address;
    const r = await this.f(`${this.tc}/getAddressInformation?address=${encodeURIComponent(a.toString())}`, { headers: this.key ? { "X-API-Key": this.key } : {} });
    const j = (await r.json()) as { ok: boolean; result?: { code?: string } };
    if (!j.ok || !j.result?.code) return null;
    return Cell.fromBase64(j.result.code).hash().toString("base64");
  }

  /** Coins listed by the ONRANK API (hidden coins excluded). */
  async coins(): Promise<ApiCoin[]> {
    const r = await this.f(`${this.api}/api/v1/coins`);
    if (!r.ok) throw new Error(`api: ${r.status}`);
    return ((await r.json()) as { items: ApiCoin[] }).items;
  }

  async coin(seq: string | number): Promise<ApiCoin> {
    const r = await this.f(`${this.api}/api/v1/coins/${seq}`);
    if (!r.ok) throw new Error(`api: ${r.status}`);
    return (await r.json()) as ApiCoin;
  }

  /** The holder's RewardWallet for a coin (TEP-74 `get_wallet_address`). */
  async walletAddress(master: Address | string, owner: Address | string): Promise<Address> {
    const m = typeof master === "string" ? parseAddress(master) : master;
    const o = typeof owner === "string" ? parseAddress(owner) : owner;
    const slice = beginCell().storeAddress(o).endCell().toBoc().toString("base64");
    const r = await this.f(`${this.tc}/runGetMethod`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.key ? { "X-API-Key": this.key } : {}) },
      body: JSON.stringify({ address: m.toString(), method: "get_wallet_address", stack: [["tvm.Slice", slice]] }),
    });
    const j = (await r.json()) as { ok: boolean; result?: { exit_code: number; stack: unknown[] } };
    if (!j.ok || !j.result || j.result.exit_code !== 0) throw new Error("get_wallet_address failed");
    const items = toncenterStackToTuple(j.result.stack);
    const first = items[0];
    if (!first || (first.type !== "slice" && first.type !== "cell")) throw new Error("get_wallet_address: unexpected stack");
    return first.cell.beginParse().loadAddress();
  }

  /**
   * Quote + unsigned message in one call. Reads the live market (curve or pool) from the chain, checks its code hash,
   * applies `slippageBps` and returns what the user must sign. Never signs. Throws on sell-only coins for buys.
   */
  async trade(p: { coin: ApiCoin; side: "buy" | "sell"; amount: bigint; slippageBps: number; owner: Address | string }): Promise<{ quote: Quote; minOut: bigint; message: TonConnectMessage; market: "curve" | "pool" }> {
    const owner = typeof p.owner === "string" ? parseAddress(p.owner) : p.owner;
    const version: LauncherVersion = p.coin.version ?? 2;
    if (p.side === "buy" && p.coin.sellOnly) throw new Error("this coin is sell-only");
    if (p.coin.pool) {
      const pool = parseAddress(p.coin.pool);
      if (version === 2) {
        const h = await this.codeHash(pool);
        if (h !== CODE_HASH.PoolV2) throw new Error(`pool code hash mismatch: ${h}`);
      }
      const state = decodePoolData(await this.runGetMethod(pool, "get_pool_data"));
      if (p.side === "buy") {
        const quote = quotePoolBuy(state, p.amount);
        const minOut = applySlippage(quote.amountOut, p.slippageBps);
        return { quote, minOut, market: "pool", message: buildPoolBuy({ pool, tonIn: p.amount, minOut, version }) };
      }
      const quote = quotePoolSell(state, p.amount);
      const minTon = applySlippage(quote.amountOut, p.slippageBps);
      const rewardWallet = await this.walletAddress(p.coin.master, owner);
      const message = version === 2 ? buildSell({ rewardWallet, owner, coinAmount: p.amount, minTon, version }) : buildPoolSellV1({ rewardWallet, pool, owner, coinAmount: p.amount, minTon });
      return { quote, minOut: minTon, market: "pool", message };
    }
    const curve = parseAddress(p.coin.curve);
    if (version === 2) {
      const h = await this.codeHash(curve);
      if (h !== CODE_HASH.CurveV2) throw new Error(`curve code hash mismatch: ${h}`);
    }
    const state = decodeCurveData(await this.runGetMethod(curve, "get_curve_data"));
    if (!isCurveOpen(state)) throw new Error("curve is not open (graduated or not started): refresh the coin");
    if (p.side === "buy") {
      const quote = quoteCurveBuyForTonIn(state, p.amount);
      const minOut = applySlippage(quote.amountOut, p.slippageBps);
      return { quote, minOut, market: "curve", message: buildCurveBuy({ curve, tonIn: p.amount, minOut }) };
    }
    const quote = quoteCurveSell(state, p.amount);
    const minTon = applySlippage(quote.amountOut, p.slippageBps);
    const rewardWallet = await this.walletAddress(p.coin.master, owner);
    return { quote, minOut: minTon, market: "curve", message: buildSell({ rewardWallet, owner, coinAmount: p.amount, minTon, version }) };
  }
}
