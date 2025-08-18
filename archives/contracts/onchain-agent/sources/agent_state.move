module nuwa_framework::agent_state{
    use std::string::{Self, String};
    use std::vector;

    #[data_struct]
    struct AgentState has copy, drop, store {
        description: String,
        state_json: String,
    }

    #[data_struct]
    struct AgentStates has copy, drop, store{
        states: vector<AgentState>,
    }

    public fun new_agent_states() : AgentStates {
        AgentStates {
            states: vector::empty(),
        }
    }

    public fun new_agent_state(description: String, state_json: String) : AgentState {
        AgentState {
            description,
            state_json,
        }
    }

    public fun add_agent_state(agent_states: &mut AgentStates, agent_state: AgentState) {
        vector::push_back(&mut agent_states.states, agent_state);
    }

    public fun format_prompt(agent_states: &AgentStates): String {
        let prompt = string::utf8(b"Your current states:\n");
       
        vector::for_each(agent_states.states, |state| {
            let state: AgentState = state;
            string::append(&mut prompt, state.description);
            string::append(&mut prompt, string::utf8(b"\n"));
            string::append(&mut prompt, string::utf8(b"```json\n"));
            string::append(&mut prompt, state.state_json);
            string::append(&mut prompt, string::utf8(b"\n```\n"));
        });
        prompt
    }
}