module nuwa_framework::agent_runner {

    use std::string;
    use std::vector;
    use std::option;
    use moveos_std::object::{Self, Object, ObjectID};
    use moveos_std::decimal_value;
    use moveos_std::type_info;
    use moveos_std::result::{Self, is_err};

    use rooch_framework::coin::{Self, Coin};
    use rooch_framework::gas_coin::RGas;
    use rooch_framework::account_coin_store;

    use nuwa_framework::action::ActionGroup;
    use nuwa_framework::agent_input::{Self, AgentInput};
    use nuwa_framework::agent_input_info::{Self, AgentInputInfo};
    use nuwa_framework::ai_request;
    use nuwa_framework::ai_service;
    use nuwa_framework::prompt_input::{Self, PromptInput};
    use nuwa_framework::agent::{Self, Agent};
    use nuwa_framework::action_dispatcher;
    use nuwa_framework::state_providers;
    use nuwa_framework::task_spec;
    use nuwa_framework::agent_cap::{AgentCap};
    use nuwa_framework::config;
    use nuwa_framework::channel::{Self, Channel};
    use nuwa_framework::memory;
    use nuwa_framework::memory_info;
    use nuwa_framework::user_profile_for_agent;
    use nuwa_framework::agent_info::{AgentInfo};

    friend nuwa_framework::channel_entry;
    friend nuwa_framework::ai_callback;

    const ErrorInsufficientBaseFee: u64 = 1;


    public fun generate_system_prompt(
        agent: &Object<Agent>,
        agent_input_info: AgentInputInfo,
    ): PromptInput {
        let agent_info = agent::get_agent_info(agent);
        generate_system_prompt_with_agent_info(agent, agent_info, agent_input_info)
    }

    public fun generate_system_prompt_with_agent_info(
        agent: &Object<Agent>,
        agent_info: AgentInfo,
        agent_input_info: AgentInputInfo,
    ): PromptInput {
        let states = state_providers::get_agent_state(agent);
        let available_actions = get_available_actions();
        
        let memory_store = agent::borrow_memory_store(agent);
        let agent_addr = agent::get_agent_address(agent);
        let user_addr = agent_input_info::get_sender(&agent_input_info);
        let self_memories = memory::get_all_memories(memory_store, agent_addr);
        let user_memories = memory::get_all_memories(memory_store, user_addr);
        let memory_info = memory_info::new();
        memory_info::add_memory(&mut memory_info, agent_addr, self_memories);
        memory_info::add_memory(&mut memory_info, user_addr, user_memories);

        let task_specs = agent::get_agent_task_specs(agent);
        task_spec::merge_task_specifications(&mut task_specs, *agent_input_info::get_app_task_specs(&agent_input_info));
        prompt_input::new(
            agent_info,
            memory_info,
            agent_input_info,
            available_actions,
            task_specs,
            states,
        )
    }

    fun process_input_internal(
        agent_obj: &mut Object<Agent>,
        input_info: AgentInputInfo,
    ) {
        let agent_id = object::id(agent_obj);
        let model_provider = *agent::get_agent_model_provider(agent_obj);
        let temperature = agent::get_agent_temperature(agent_obj);
        
        // Generate system prompt with context
        let prompt = generate_system_prompt(
            agent_obj,
            input_info,
        );
        let system_prompt = prompt_input::format_prompt(&prompt);
        // Create chat messages
        let messages = vector::empty();
        
        // Add system message
        vector::push_back(&mut messages, ai_request::new_system_chat_message(system_prompt));

        // Create chat request
        let chat_request = ai_request::new_chat_request(
            model_provider,
            messages,
            temperature,
        );
        //Use the agent signer to call the AI service
        let agent_signer = agent::create_agent_signer(agent_obj);  
        // Call AI service
        let result = ai_service::request_ai(&agent_signer, agent_id, prompt, chat_request); 
        if (is_err(&result)) {
            let ai_addr = agent::get_agent_address(agent_obj);
            let err = result::unwrap_err(result);
            let response = string::utf8(b"Call AI agent failed:");
            string::append(&mut response, err);
            let channel_id = agent_input_info::get_response_channel_id(&input_info);
            let channel_obj = object::borrow_mut_object_shared<Channel>(channel_id);
            channel::add_ai_response(channel_obj, response, ai_addr, 0);
        }else{
            let request_id = result::unwrap(result);
            agent::add_processing_request(agent_obj, request_id);
        };
    }

    public(friend) fun submit_input_info(
        agent_obj: &mut Object<Agent>,
        input_info: AgentInputInfo,
    ) { 
        agent::append_input(agent_obj, input_info);
        agent::update_last_active_timestamp(agent_obj);
        try_process_input(agent_obj);
    }

    public(friend) fun submit_input_internal<I: copy + drop + store>(
        agent_obj: &mut Object<Agent>,
        input: AgentInput<I>,
        fee: Coin<RGas>, 
    ) {
        
        let coin_type = type_info::type_name<RGas>();
        let coin_symbol = coin::symbol_by_type<RGas>();
        let decimals = coin::decimals_by_type<RGas>();
        let amount = coin::value(&fee);
        let agent_addr = agent::get_agent_address(agent_obj);
        account_coin_store::deposit<RGas>(agent_addr, fee);

        let amount_except_base_fee = if (amount > config::get_ai_agent_base_fee()) {
            amount - config::get_ai_agent_base_fee()
        } else {
            0
        };

        let coin_input_info = agent_input_info::new_coin_input_info(
            coin_symbol,
            coin_type,
            decimal_value::new(amount_except_base_fee, decimals),
        );
        let sender = agent_input::get_sender(&input);
        let sender_profile = user_profile_for_agent::get_user_profile(sender);
        let input_info = agent_input::into_agent_input_info(input, sender_profile, coin_input_info);
        submit_input_info(agent_obj, input_info);
    }

    public fun submit_input_by_cap<I: copy + drop + store>(
        agent_obj: &mut Object<Agent>,
        input: AgentInput<I>,
        fee: Coin<RGas>,
        _agent_cap: &mut Object<AgentCap>,
    ) {
        submit_input_internal(agent_obj, input, fee)
    }

    /// Try to process the input of the agent
    public entry fun try_process_input(agent_obj: &mut Object<Agent>){
        if (agent::is_processing_request(agent_obj)) {
            return
        };
        let input = agent::dequeue_input(agent_obj);
        if (option::is_some(&input)) {
            let input = option::destroy_some(input);
            process_input_internal(agent_obj, input)
        }
    }

    public(friend) fun finish_request(agent_obj: &mut Object<Agent>, prompt: PromptInput, request_id: ObjectID) {
        agent::finish_request(agent_obj, request_id);
        check_memory_length(agent_obj, &prompt);
        //continue processing the input
        try_process_input(agent_obj);
    }

    fun get_available_actions(): vector<ActionGroup> {
        action_dispatcher::get_action_groups()
    }

    const COMPACT_MEMORY_LENGTH: u64 = 10;

    fun check_memory_length(agent_obj: &mut Object<Agent>, prompt: &PromptInput) {
        let memory_store = agent::borrow_memory_store(agent_obj);
        let agent_addr = agent::get_agent_address(agent_obj);
        let pre_input_info = prompt_input::get_input_info(prompt);
        let user_addr = agent_input_info::get_sender(pre_input_info);
        //We refetch the sender profile to make sure it's up to date
        let sender_profile = user_profile_for_agent::get_user_profile(user_addr);
        let response_channel_id = agent_input_info::get_response_channel_id(pre_input_info);
        let self_memories = memory::get_all_memories(memory_store, agent_addr);
        let user_memories = memory::get_all_memories(memory_store, user_addr);

        if (vector::length(&self_memories) > COMPACT_MEMORY_LENGTH) {
            let input_info = agent_input_info::new_raw_message_input_info(user_addr, sender_profile, response_channel_id, string::utf8(b"Please compact the memory about yourself"));
            submit_input_info(agent_obj, input_info);
        };
        
        if (vector::length(&user_memories) > COMPACT_MEMORY_LENGTH) {
            let input_info = agent_input_info::new_raw_message_input_info(user_addr, sender_profile, response_channel_id, string::utf8(b"Please compact the memory about the sender"));
            submit_input_info(agent_obj, input_info);
        };
    }
}