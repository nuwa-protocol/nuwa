const empty = (
  <div>
    asdas
  </div>
);

export default {
  index: {
    display: "hidden",
    title: "asda",
    theme: {
      layout: "full",
      toc: false,
      sidebar: true,
      breadcrumb: false,
      timestamp: false,
      pagination: false,
    }
  },
  separator1: { type: "separator", title: "Introduction" },
  overview: "Overview",
  usecases: "Use Cases",
  architecture: "Architecture",
  separator2: { type: "separator", title: "Agent Capability Protocol" },
  cap: "Cap",
  payment: "Payment",
  "mcp-compatibility": "MCP Compatibility",
  "a2a-compatibility": "A2A Compatibility",
  separator3: { type: "separator", title: "Nuwa Client" },
  identity: "Identity",
  wallet: "Wallet",
  "agent-state": "Agent State",
  separator4: { type: "separator", title: "Reference" },
  nips: "NIPs",
  faq: {
    title: "FAQ",
    display: "hidden",
  },
};
