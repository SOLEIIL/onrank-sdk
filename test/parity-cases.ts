/** Inputs shared by the fixture generator and the parity tests (addresses are public ONRANK accounts). */
export const CASES = {
  queryId: "0x123456789abcdef0",
  curve: "0:a2a79ca2795a82d96d2874753a5ff0871dc5658c067f9b4a3471179880746374",
  pool: "EQB18IIqz56m9AAwNpX0Ai61_LNa4yquhT3QRNk4geiLwdhA",
  wallet: "EQCpS9EiKrk0W7pCEybeKiCbzLL1b-CSTeiHHgVGKCQD5Mc1",
  owner: "EQBKCClSs3RhzCXqQrLf8uyUPUBuCmU4P4YGY51tJyNMYgMe",
  curveBuy: { tonIn: "5000000000", minOut: "123" },
  poolBuy: { tonIn: "1000000000", minOut: "7" },
  sell: { coinAmount: "1000000000000000", minTon: "99" },
  poolSell: { coinAmount: "42", minTon: "3" },
} as const;
