export const normalizeCoinIconUrl = (onChainCoinIconUrl?: string | null) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(onChainCoinIconUrl || '')}`;