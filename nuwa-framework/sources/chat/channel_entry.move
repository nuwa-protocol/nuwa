module nuwa_framework::channel_entry {
    use std::vector;
    use std::string::{Self, String};
    use moveos_std::object::Object;
    use moveos_std::type_info;
    use moveos_std::result::{Self, is_err};
    use rooch_framework::gas_coin::RGas;
    use rooch_framework::account_coin_store;
    use nuwa_framework::channel::{Self, Channel};
    use nuwa_framework::agent;
    use nuwa_framework::agent_runner;
    use nuwa_framework::task_spec;
    use nuwa_framework::config;
    use nuwa_framework::message_for_agent;
    use nuwa_framework::message;
    
    const ErrorInvalidCoinType: u64 = 1;
    const ErrorInvalidToAddress: u64 = 2;

    
    /// Send a message and trigger AI response if needed
    public entry fun send_message(
        caller: &signer,
        channel_obj: &mut Object<Channel>,
        content: String,
        mentions: vector<address>,
        reply_to: u64
    ) {
        let (_msg_id, index) = channel::send_message(caller, channel_obj, content, mentions, reply_to);
        let mentioned_ai_agents = vector::empty();
        vector::for_each(mentions, |addr| {
            if (agent::is_agent_account(addr) && !vector::contains(&mentioned_ai_agents, &addr)) {
                vector::push_back(&mut mentioned_ai_agents, addr);
            }
        });
        if (vector::length(&mentioned_ai_agents) > 0) {
            //we only call the first mentioned ai agent
            let agent_address = *vector::borrow(&mentioned_ai_agents, 0);
            call_agent(caller, channel_obj, index, agent_address, 0);
        }
    }

    public entry fun send_message_with_coin<CoinType: key+store>(
        caller: &signer,
        channel_obj: &mut Object<Channel>,
        content: String,
        mentions: vector<address>,
        reply_to: u64,
        to: address,
        amount: u256,
    ) {
        //Currently only support send coin to agent
        assert!(agent::is_agent_account(to), ErrorInvalidToAddress);
        if (!vector::contains(&mentions, &to)) {
            vector::push_back(&mut mentions, to);
        };
        //currently only support RGas
        assert!(type_info::type_name<CoinType>() == type_info::type_name<RGas>(), ErrorInvalidCoinType);
        let (_msg_id, index) = channel::send_message(caller, channel_obj, content, mentions, reply_to);
        call_agent(caller, channel_obj, index, to, amount);     
    }

    fun call_agent(caller: &signer, channel_obj: &mut Object<Channel>, user_msg_index: u64, ai_addr: address, extra_fee: u256) {
        let amount_fee = config::get_ai_agent_base_fee() + extra_fee;
        let fee = account_coin_store::withdraw<RGas>(caller, amount_fee);

        let message_limit: u64 = config::get_history_message_size() + 1;
        let message_ids = channel::get_last_messages(channel_obj, message_limit);
        let messages = message::get_messages_by_ids(&message_ids);
        
        let message_input = message_for_agent::new_agent_input(messages);
        let agent = agent::borrow_mut_agent_by_address(ai_addr);
        let app_task_specs = task_spec::empty_task_specifications();
        let result = agent_runner::process_input_internal(agent, message_input, fee, app_task_specs);
        if (is_err(&result)) {
            let err = result::unwrap_err(result);
            let response = string::utf8(b"Call AI agent failed:");
            string::append(&mut response, err);
            channel::add_ai_response(channel_obj, response, ai_addr, user_msg_index);
        }
    }
}