module nuwa_framework::global_provider {
    use std::option;
    use std::string;
    use moveos_std::object::{Object};
    use moveos_std::timestamp;
    use moveos_std::json;
    use bitcoin_move::pending_block;
    use bitcoin_move::types;
    use nuwa_framework::agent::{Agent};
    use nuwa_framework::agent_state::{Self, AgentState};

    friend nuwa_framework::state_providers;

    #[data_struct]
    struct GlobalState has copy, drop, store {
        timestamp_in_milliseconds: u64,
        bitcoin_block_height: u64,
    }

    public(friend) fun get_state(_agent: &Object<Agent>): AgentState {
        let timestamp = timestamp::now_milliseconds();
        let block_height_hash_opt = pending_block::get_best_block();
        let bitcoin_block_height = if(option::is_some(&block_height_hash_opt)) {
            let block_height_hash = option::destroy_some(block_height_hash_opt);
            let (block_height, _block_hash) = types::unpack_block_height_hash(block_height_hash);
            block_height
        }else{
            0
        };
        let state = GlobalState {
            timestamp_in_milliseconds: timestamp,
            bitcoin_block_height: bitcoin_block_height,
        };
        agent_state::new_agent_state(string::utf8(b"Global state:"), string::utf8(json::to_json(&state)))
    }
}