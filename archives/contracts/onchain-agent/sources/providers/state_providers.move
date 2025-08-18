module nuwa_framework::state_providers{
    use moveos_std::object::{Object};
    use nuwa_framework::agent::{Agent};
    use nuwa_framework::agent_state::{Self, AgentStates};
    use nuwa_framework::balance_provider;
    use nuwa_framework::channel_provider;
    use nuwa_framework::price_provider;
    use nuwa_framework::global_provider;
    
    public fun get_agent_state(agent: &Object<Agent>): AgentStates {
        let agent_states = agent_state::new_agent_states();
        let global_state = global_provider::get_state(agent);
        agent_state::add_agent_state(&mut agent_states, global_state);
        let balance_state = balance_provider::get_state(agent);
        agent_state::add_agent_state(&mut agent_states, balance_state);
        let channel_state = channel_provider::get_state(agent);
        agent_state::add_agent_state(&mut agent_states, channel_state);
        let price_state = price_provider::get_state(agent);
        agent_state::add_agent_state(&mut agent_states, price_state);
        agent_states 
    }
}