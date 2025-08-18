import { BigNumber } from "bignumber.js";

export const formatAmountDisplay = (
  amount: number | string | bigint,
  decimals?: number
) => {
  return new BigNumber(amount.toString()).toFormat(decimals ?? 2);
};
