module nuwa_framework::channel_provider{
    use std::string::{Self, String};
    use moveos_std::object::{Self, Object};
    use moveos_std::json;
    use nuwa_framework::agent::{Agent};
    use nuwa_framework::channel;
    use nuwa_framework::agent_state::{Self, AgentState};

    friend nuwa_framework::state_providers;

    #[data_struct]
    struct ChannelState has copy, drop, store {
        home_channel: String,
    }

    public(friend) fun get_state(agent: &Object<Agent>): AgentState {
        let home_channel_id = channel::get_agent_home_channel_id(agent);
        let home_channel = object::to_string(&home_channel_id);
        let channel_state = ChannelState {
            home_channel
        };
        let state_json = string::utf8(json::to_json(&channel_state));
        let agent_state = agent_state::new_agent_state(string::utf8(b"Your channel state"), state_json);
        agent_state
    }
}