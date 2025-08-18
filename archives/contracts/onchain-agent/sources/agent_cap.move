// Copyright (c) RoochNetwork
// SPDX-License-Identifier: Apache-2.0

module nuwa_framework::agent_cap {

    use moveos_std::object::{Self, Object, ObjectID};
    use moveos_std::event;
    
    const ErrorAgentCapNotFound: u64 = 1;
    const ErrorCallerHasNoMemoryCap: u64 = 2;
    const ErrorCallerHasNoMemoryCreateCap: u64 = 3;
    const ErrorCallerHasNoMemoryDeleteCap: u64 = 4;
    const ErrorCallerHasNoMemoryUpdateCap: u64 = 5;

    friend nuwa_framework::agent;

    /// AgentCap is a cap that allows the caller to update the agent's instructions.
    /// It can be transferred. If the AgentCap is destroyed, the agent's will be an independent agent.
    struct AgentCap has store, key {
        agent_obj_id: ObjectID,
    }

    struct AgentCapDestroyedEvent has copy, drop, store {
        agent_obj_id: ObjectID,
    }

    public(friend) fun new_agent_cap(agent_obj_id: ObjectID) : Object<AgentCap> {
        let cap = AgentCap {
            agent_obj_id,
        };
        object::new(cap)
    }


    public(friend) fun destroy_agent_cap(cap: Object<AgentCap>) {
        let agent_cap = object::remove(cap);
        let AgentCap { agent_obj_id } = agent_cap;
        event::emit(AgentCapDestroyedEvent { agent_obj_id });
    }

    public fun borrow_mut_agent_cap(caller: &signer, agent_obj_id: ObjectID) : &mut Object<AgentCap> {
        assert!(object::exists_object(agent_obj_id), ErrorAgentCapNotFound);
        object::borrow_mut_object<AgentCap>(caller, agent_obj_id)
    }

    public fun get_agent_obj_id(cap: &Object<AgentCap>) : ObjectID {
        let cap = object::borrow(cap);
        cap.agent_obj_id
    }

    #[test_only]
    public fun issue_agent_cap_for_test(agent_obj_id: ObjectID) : Object<AgentCap> {
        new_agent_cap(agent_obj_id)
    }


}
