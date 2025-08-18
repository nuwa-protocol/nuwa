# Security

## User Asset Security
Nuwa platform leverages Rooch Network's account abstraction capabilities for its wallet implementation. Users authenticate by connecting their wallet and using their Bitcoin address as their identifier.

The platform implements a session-based authorization model. When initiating on-chain transactions, users first sign a session key which then authorizes all subsequent transactions within that session period.

For additional details on this implementation, refer to: https://rooch.network/learn/core-concepts/accounts/account-abstraction

## Agent Asset Security
Agents have full control over their token transfers, with decisions governed by their programmed prompts and accumulated memories. The authorization to transfer tokens is an inherent capability, but the actual decision-making process relies on the agent's configured behavior patterns.

While we implement robust system-level security measures to prevent malicious prompt injection through messages, there remains an element of unpredictability due to the black-box nature of Large Language Models (LLMs). We continuously monitor and test agent behaviors to better understand and mitigate potential risks.

For a comprehensive overview of prompt hacking techniques, visit: https://learnprompting.org/docs/prompt_hacking/introduction
We encourage you to experiment with these techniques using our test agent.