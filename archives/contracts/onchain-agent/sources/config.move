module nuwa_framework::config {

    /// The number of history messages to send to the AI agent
    const HISTORY_MESSAGE_SIZE: u64 = 10;
    public fun get_history_message_size(): u64 {
        HISTORY_MESSAGE_SIZE
    }
    
    /// The base fee to call the AI agent, default is 5 RGas
    const AI_AGENT_BASE_FEE: u256 = 15_0000_0000;
    public fun get_ai_agent_base_fee(): u256 {
        AI_AGENT_BASE_FEE
    }

    /// The initial fee to create an AI agent, default is 100 RGas
    const AI_AGENT_INITIAL_FEE: u256 = 100_0000_0000;
    public fun get_ai_agent_initial_fee(): u256 {
        AI_AGENT_INITIAL_FEE
    }

    const USERNAME_REGISTRATION_FEE: u256 = 10_0000_0000;
    public fun get_username_registration_fee(): u256 {
        USERNAME_REGISTRATION_FEE
    }

    const MIN_USERNAME_LENGTH: u64 = 4;
    public fun get_min_username_length(): u64 {
        MIN_USERNAME_LENGTH
    }

    const MAX_USERNAME_LENGTH: u64 = 20;
    public fun get_max_username_length(): u64 {
        MAX_USERNAME_LENGTH
    }

    const MIN_NAME_LENGTH: u64 = 2;
    public fun get_min_name_length(): u64 {
        MIN_NAME_LENGTH
    }

    const MAX_NAME_LENGTH: u64 = 30;
    public fun get_max_name_length(): u64 {
        MAX_NAME_LENGTH
    }

    const MIN_CHANNEL_TITLE_LENGTH: u64 = 1;
    public fun get_min_channel_title_length(): u64 {
        MIN_CHANNEL_TITLE_LENGTH
    }

    const MAX_CHANNEL_TITLE_LENGTH: u64 = 50;
    public fun get_max_channel_title_length(): u64 {
        MAX_CHANNEL_TITLE_LENGTH
    }

    const MAX_CHANNEL_MESSAGE_LENGTH: u64 = 1000;
    public fun get_max_channel_message_length(): u64 {
        MAX_CHANNEL_MESSAGE_LENGTH
    }

    const MAX_AGENT_DESCRIPTION_LENGTH: u64 = 500;
    public fun get_max_agent_description_length(): u64 {
        MAX_AGENT_DESCRIPTION_LENGTH
    }

    const MAX_AGENT_INSTRUCTIONS_LENGTH: u64 = 3000;
    public fun get_max_agent_instructions_length(): u64 {
        MAX_AGENT_INSTRUCTIONS_LENGTH
    }

}