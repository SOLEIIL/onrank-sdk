# @onrank/sdk

Quote and trade [ONRANK](https://t.me/OnRankBot) coins from your own bot, wallet or terminal. Pure TypeScript:
the SDK **builds unsigned messages** that the user signs with their wallet (TON Connect or any wallet SDK).
It never holds a key and never signs.

```bash
npm i @onrank/sdk @ton/core
```

## 60-second integration

```ts
import { OnrankClient, applySlippage } from "@onrank/sdk";

const onrank = new OnrankClient({ toncenterKey: process.env.TONCENTER_KEY }); // key optional

const coin = await onrank.coin(10001);                   // $RANK — or onrank.coins() for the list
const { quote, minOut, message, market } = await onrank.trade({
  coin,
  side: "buy",                                           // or "sell"
  amount: 5_000_000_000n,                                // buy: nanoTON to swap · sell: coin units (9 decimals)
  slippageBps: 200,                                      // 2 %
  owner: userWalletAddress,
});
// quote.amountOut = coins you get (buy) / nanoTON you get (sell); minOut = what the contract must at least deliver
await tonConnectUI.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, messages: [message] });
```

`trade()` reads the live curve or pool from toncenter, **checks the contract code hash** against the published
build, applies the slippage and returns `{ address, amount, payload }`.

## Without the client (no network in the SDK)

```ts
import { buildCurveBuy, buildSell, quoteCurveBuyForTonIn, quoteCurveSell, decodeCurveData, applySlippage } from "@onrank/sdk";

const state = decodeCurveData(stackFromYourOwnRpc);      // get_curve_data
const q = quoteCurveBuyForTonIn(state, 5_000_000_000n);  // same integer math as the contract
const msg = buildCurveBuy({ curve, tonIn: 5_000_000_000n, minOut: applySlippage(q.amountOut, 200) });

const s = quoteCurveSell(state, coinAmount);
const sell = buildSell({ rewardWallet, owner, coinAmount, minTon: applySlippage(s.amountOut, 200) });
// rewardWallet = get_wallet_address(owner) on the coin's master (TEP-74)
```

Pool coins: `quotePoolBuy` / `quotePoolSell` with `decodePoolData(get_pool_data)`, `buildPoolBuy`; selling on a v2
pool is the same `buildSell` (the master routes it).

## Events

`decodeTradeEvent(topic, body)` decodes `CurveTrade`, `PoolSwap`, `CurveGraduated`, `LaunchCreated` from the
external out-messages of the contracts; `topicOf(dest)` extracts the topic. See
[EVENTS.md](https://onrank.lol/integration/EVENTS.md).

## Guarantees

- Message layouts are tested bit-for-bit against the ONRANK app's own builders.
- Quote formulas are pinned to the on-chain `get_buy_quote` / `get_sell_quote` results of the live $RANK curve.
- Builders refuse `minOut`/`minTon = 0`: no trade without slippage protection.

Full protocol reference: [onrank.lol/integration/README.md](https://onrank.lol/integration/README.md) · [onrank.lol/developers](https://onrank.lol/developers) · contracts: [onrank-contracts](https://github.com/SOLEIIL/onrank-contracts).
MIT.
