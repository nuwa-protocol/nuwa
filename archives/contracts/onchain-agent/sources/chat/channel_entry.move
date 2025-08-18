module nuwa_framework::channel_entry {
    use std::vector;
    use std::string::{Self, String};
    use moveos_std::object::Object;
    use moveos_std::type_info;
    use moveos_std::decimal_value;
    use rooch_framework::gas_coin::RGas;
    use rooch_framework::coin::{Coin};
    use rooch_framework::account_coin_store;
    use nuwa_framework::channel::{Self, Channel};
    use nuwa_framework::agent;
    use nuwa_framework::agent_runner;
    use nuwa_framework::config;
    use nuwa_framework::message_for_agent;
    use nuwa_framework::message;
    use nuwa_framework::attachment;

    friend nuwa_framework::task_entry;

    const ErrorInvalidCoinType: u64 = 1;
    const ErrorInvalidToAddress: u64 = 2;
    const ErrorInvalidAmount: u64 = 3;
    
    /// Send a message and trigger AI response if needed
    public entry fun send_message(
        caller: &signer,
        channel_obj: &mut Object<Channel>,
        content: String,
        mentions: vector<address>,
        reply_to: u64
    ) {
        let (_msg_id, _index) = channel::send_message(caller, channel_obj, content, mentions, reply_to, vector::empty());
        let mentioned_ai_agents = vector::empty();
        vector::for_each(mentions, |addr| {
            if (agent::is_agent_account(addr) && !vector::contains(&mentioned_ai_agents, &addr)) {
                vector::push_back(&mut mentioned_ai_agents, addr);
            }
        });
        if (vector::length(&mentioned_ai_agents) > 0) {
            //we only call the first mentioned ai agent
            let agent_address = *vector::borrow(&mentioned_ai_agents, 0);
            call_agent_by_caller(caller, channel_obj, agent_address, 0);
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
        assert!(amount > 0, ErrorInvalidAmount);
        let is_transfer_to_agent = agent::is_agent_account(to);
        //if the transfer is to an agent, we ensure the agent is in the mentions
        if (is_transfer_to_agent && !vector::contains(&mentions, &to)) {
            vector::push_back(&mut mentions, to);
        };
        //currently only support RGas
        assert!(type_info::type_name<CoinType>() == type_info::type_name<RGas>(), ErrorInvalidCoinType);
        let coin_type = type_info::type_name<RGas>();
        let coin_symbol = string::utf8(b"RGas");
        let coin_decimal = 8;

        let coin_attachment = attachment::new_coin_attachment(
            coin_type,
            coin_symbol,
            to,
            decimal_value::new(amount, coin_decimal)
        );
        let (_msg_id, _index) = channel::send_message(caller, channel_obj, content, mentions, reply_to, vector::singleton(coin_attachment));
        if (is_transfer_to_agent) {
            call_agent_by_caller(caller, channel_obj, to, amount); 
        }else{
            let mentioned_ai_agents = vector::empty();
            vector::for_each(mentions, |addr| {
                if (agent::is_agent_account(addr) && !vector::contains(&mentioned_ai_agents, &addr)) {
                    vector::push_back(&mut mentioned_ai_agents, addr);
                }
            });
            if (vector::length(&mentioned_ai_agents) > 0) {
                //we only call the first mentioned ai agent
                let agent_address = *vector::borrow(&mentioned_ai_agents, 0);
                call_agent_by_caller(caller, channel_obj, agent_address, 0);
            };
        };
    }

    fun call_agent_by_caller(caller: &signer, channel_obj: &mut Object<Channel>, ai_addr: address, extra_fee: u256) {
        let amount_fee = config::get_ai_agent_base_fee() + extra_fee;
        let fee = account_coin_store::withdraw<RGas>(caller, amount_fee);
        call_agent_process_message(channel_obj, ai_addr, fee);
    }

    public(friend) fun call_agent_process_message(channel_obj: &mut Object<Channel>, ai_addr: address, fee: Coin<RGas>) {
        let message_limit: u64 = config::get_history_message_size() + 1;
        let message_ids = channel::get_last_messages(channel_obj, message_limit);
        let messages = message::get_messages_by_ids(&message_ids);
        
        let message_input = message_for_agent::new_agent_input_with_agent_address(ai_addr, messages);
        let agent = agent::borrow_mut_agent_by_address(ai_addr);
        agent_runner::submit_input_internal(agent, message_input, fee);
    }

    public entry fun create_topic_channel(
        user_account: &signer,
        parent_channel_obj: &mut Object<Channel>,
        topic: String,
        join_policy: u8,
    ) {
        channel::create_topic_channel(user_account, parent_channel_obj, topic, join_policy);
    }

    
    public entry fun join_channel(
        account: &signer,
        channel_obj: &mut Object<Channel>,
    ) {
        channel::join_channel(account, channel_obj);
    }

    public entry fun leave_channel(
        account: &signer,
        channel_obj: &mut Object<Channel>,
    ) {
        channel::leave_channel(account, channel_obj);
    }
}