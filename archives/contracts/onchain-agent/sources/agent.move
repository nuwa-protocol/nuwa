module nuwa_framework::agent {
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use std::vector;
    use moveos_std::object::{Self, Object, ObjectID};
    use moveos_std::account::{Self, AccountCap};
    use moveos_std::signer;
    use moveos_std::timestamp;
    use moveos_std::decimal_value::{Self, DecimalValue};
    use moveos_std::string_utils;
    use moveos_std::event;

    use rooch_framework::coin::{Self, Coin};
    use rooch_framework::account_coin_store;
    use rooch_framework::gas_coin::RGas;

    use nuwa_framework::agent_cap::{Self, AgentCap};
    use nuwa_framework::memory::{Self, MemoryStore};
    use nuwa_framework::agent_info;
    use nuwa_framework::agent_input_info::{AgentInputInfo};
    use nuwa_framework::task_spec::{Self, TaskSpecifications, TaskSpecification};
    use nuwa_framework::config;
    use nuwa_framework::user_profile;
    use nuwa_framework::user_input_validator::{validate_agent_description, validate_agent_instructions};
    
    friend nuwa_framework::memory_action;
    friend nuwa_framework::transfer_action;
    friend nuwa_framework::action_dispatcher;
    friend nuwa_framework::agent_runner;

    const TASK_SPEC_PROPERTY_NAME: vector<u8> = b"task_specs";
    const AGENT_CAP_PROPERTY_NAME: vector<u8> = b"agent_cap";
    const AGENT_INPUT_QUEUE_PROPERTY_NAME: vector<u8> = b"input_queue";
    const AGENT_PROCESSING_REQUEST_PROPERTY_NAME: vector<u8> = b"processing_request";

    const ErrorDeprecatedFunction: u64 = 1;
    const ErrorInvalidInitialFee: u64 = 2;
    const ErrorInvalidAgentCap: u64 = 3;
    const ErrorInvalidTemperature: u64 = 4;
    
    const AGENT_STATUS_DRAFT: u8 = 0;
    const AGENT_STATUS_ACTIVE: u8 = 1;
    const AGENT_STATUS_INACTIVE: u8 = 2;

    /// OnChain AI Agent
    struct Agent has key {
        /// The address of the agent
        agent_address: address,
        /// The name of the agent
        name: String,
        /// The unique identifier for the agent
        username: String,
        /// The avatar of the agent
        avatar: String,
        /// One-line description of the agent
        description: String,
        /// Instructions for the agent when the agent is running
        instructions: String,
        // The Agent account cap, the agent can control the account
        account_cap: AccountCap,
        last_active_timestamp: u64,
        memory_store: MemoryStore,
        model_provider: String,
        temperature: DecimalValue,
        status: u8,
    }

    /// The input queue of the agent
    struct AgentInputQueue has key, store {
        queue: vector<AgentInputInfo>,
    }

    /// The processing request of the agent
    struct AgentProcessingRequest has key, store {
        requests: vector<ObjectID>,
    }

    struct NewAgentEvent has store, copy, drop {
        agent_address: address,
        agent_id: ObjectID,
        agent_cap_id: ObjectID,
    }

    struct AgentAddMemoryEvent has store, copy, drop {
        agent_address: address,
        memory_key: address,
        memory_content: String,
    }

    struct AgentUpdateMemoryEvent has store, copy, drop {
        agent_address: address,
        memory_key: address,
        memory_index: u64,
        memory_content: String,
    }

    struct AgentCompactMemoryEvent has store, copy, drop {
        agent_address: address,
        memory_key: address,
        original_memory: vector<memory::Memory>,
        compact_memory: String,
    }

    struct AgentRemoveMemoryEvent has store, copy, drop {
        agent_address: address,
        memory_key: address,
        memory_index: u64,
    }

    struct AgentInstructionUpdateEvent has store, copy, drop {
        agent_address: address,
        old_instructions: String,
        new_instructions: String,
    }

    struct AgentCapDestroyEvent has store, copy, drop {
        agent_address: address,
        agent_cap_id: ObjectID,
    }

    const AI_GPT4O_MODEL: vector<u8> = b"gpt-4o";

    public fun create_agent_with_initial_fee(name: String, username: String, avatar: String, description: String, instructions: String, initial_fee: Coin<RGas>) : Object<AgentCap> {
        
        let initial_fee_amount = coin::value(&initial_fee);
        assert!(initial_fee_amount >= config::get_ai_agent_initial_fee(), ErrorInvalidInitialFee);
        let account_cap = account::create_account_and_return_cap();
        let agent_signer = account::create_signer_with_account_cap(&mut account_cap);
        let agent_address = signer::address_of(&agent_signer);
        account_coin_store::deposit<RGas>(agent_address, initial_fee);

        let lowercase_username = string_utils::to_lower_case(&username);
        // Create a user profile for the agent
        user_profile::init_profile(&agent_signer, name, lowercase_username, avatar);
        //The name and username has validated in user_profile::init_profile
        validate_agent_description(&description);
        validate_agent_instructions(&instructions);
        
        let agent = Agent {
            agent_address,
            name,
            username: lowercase_username,
            avatar,
            description,
            instructions,
            account_cap,
            last_active_timestamp: timestamp::now_milliseconds(),
            memory_store: memory::new_memory_store(),
            model_provider: string::utf8(AI_GPT4O_MODEL),
            // Default temperature is 0.7
            temperature: decimal_value::new(7, 1),
            status: AGENT_STATUS_DRAFT,
        };
        
        // Every account only has one agent
        let agent_obj = object::new_account_named_object(agent_address, agent);
        let agent_obj_id = object::id(&agent_obj);
        let agent_cap = agent_cap::new_agent_cap(agent_obj_id);
        let agent_cap_id = object::id(&agent_cap);
        set_agent_cap_property(&mut agent_obj, &agent_cap);
        object::to_shared(agent_obj);
        let event = NewAgentEvent {
            agent_address,
            agent_id: agent_obj_id,
            agent_cap_id,
        };
        event::emit(event);
        agent_cap
    } 

    public fun borrow_mut_agent(agent_obj_id: ObjectID): &mut Object<Agent> {
        object::borrow_mut_object_shared(agent_obj_id)
    }

    public fun borrow_mut_agent_by_address(agent_addr: address): &mut Object<Agent> {
        let agent_obj_id = object::account_named_object_id<Agent>(agent_addr);
        object::borrow_mut_object_shared(agent_obj_id)
    }

    /// Get mutable reference to agent's memory store
    public(friend) fun borrow_mut_memory_store(agent: &mut Object<Agent>): &mut memory::MemoryStore {
        let agent_ref = object::borrow_mut(agent);
        &mut agent_ref.memory_store
    }

    /// Get immutable reference to agent's memory store
    public(friend) fun borrow_memory_store(agent: &Object<Agent>): &memory::MemoryStore {
        let agent_ref = object::borrow(agent);
        &agent_ref.memory_store
    }

    public fun get_agent_info(agent_obj: &Object<Agent>): agent_info::AgentInfo {
        let id = object::id(agent_obj);
        let agent = object::borrow(agent_obj);
        agent_info::new_agent_info(
            id,
            agent.agent_address,
            agent.name,
            agent.username,
            agent.avatar,
            agent.description,
            agent.instructions,
            agent.model_provider,
            agent.temperature,
            agent.status,
        )
    }

    public fun get_agent_info_by_address(agent_addr: address): agent_info::AgentInfo {
        let agent_obj_id = object::account_named_object_id<Agent>(agent_addr);
        let agent_obj = object::borrow_object<Agent>(agent_obj_id);
        get_agent_info(agent_obj)
    }

    public fun get_agent_id_by_address(agent_addr: address): ObjectID {
        let agent_obj_id = object::account_named_object_id<Agent>(agent_addr);
        agent_obj_id
    }

    /// Get agent's address
    public fun get_agent_address(agent: &Object<Agent>): address {
        let agent_ref = object::borrow(agent);
        agent_ref.agent_address
    }

    public fun get_agent_username(agent: &Object<Agent>): &String {
        let agent_ref = object::borrow(agent);
        &agent_ref.username
    }

    public fun get_agent_model_provider(agent: &Object<Agent>): &String {
        let agent_ref = object::borrow(agent);
        &agent_ref.model_provider
    }

    public fun get_agent_temperature(agent: &Object<Agent>): DecimalValue {
        let agent_ref = object::borrow(agent);
        agent_ref.temperature
    }

    public entry fun destroy_agent_cap(agent_obj: &mut Object<Agent>, cap: Object<AgentCap>) {
        let agent_cap_id = object::id(&cap);
        let agent_address = get_agent_address(agent_obj);
        let agent_obj_id = agent_cap::get_agent_obj_id(&cap);
        assert!(object::id(agent_obj) == agent_obj_id, ErrorInvalidAgentCap);
        agent_cap::destroy_agent_cap(cap);
        remove_agent_cap_property(agent_obj);
        let event = AgentCapDestroyEvent {
            agent_address,
            agent_cap_id,
        };
        event::emit(event);
    }

    public fun is_agent_account(addr: address): bool {
        let agent_obj_id = object::account_named_object_id<Agent>(addr);
        object::exists_object(agent_obj_id)
    }

    /// Get the agent's own personal memories
    public fun get_agent_self_memories(agent_obj_id: ObjectID): vector<memory::Memory> {
        let agent_obj = object::borrow_object<Agent>(agent_obj_id);
        let agent_ref = object::borrow(agent_obj);
        let memory_store = &agent_ref.memory_store;
        let agent_address = agent_ref.agent_address;
        
        // Get the agent's own memories (self-reflections, personal thoughts)
        memory::get_all_memories(memory_store, agent_address)
    }

    /// Get memories that an agent has about a specific user
    public fun get_agent_memories_about_user(agent_obj_id: ObjectID, user_address: address): vector<memory::Memory> {
        let agent_obj = object::borrow_object<Agent>(agent_obj_id);
        let agent_ref = object::borrow(agent_obj);
        let memory_store = &agent_ref.memory_store;
        
        // Get all memories about this specific user
        memory::get_all_memories(memory_store, user_address)
    }

    public(friend) fun add_memory(agent: &mut Object<Agent>, addr: address, content: String) {
        let agent_address = get_agent_address(agent);
        let store = borrow_mut_memory_store(agent);
        memory::add_memory(store, addr, content);
        let event = AgentAddMemoryEvent {
            agent_address,
            memory_key: addr,
            memory_content: content,
        };
        let handle = event::custom_event_handle_id<address, AgentAddMemoryEvent>(agent_address);
        event::emit_with_handle(handle, event);
    }

    public(friend) fun update_memory(agent: &mut Object<Agent>, addr: address, index: u64, content: String) {
        let agent_address = get_agent_address(agent);
        let store = borrow_mut_memory_store(agent);
        memory::update_memory(store, addr, index, content);
        let event = AgentUpdateMemoryEvent {
            agent_address,
            memory_key: addr,
            memory_index: index,
            memory_content: content,
        };
        let handle = event::custom_event_handle_id<address, AgentUpdateMemoryEvent>(agent_address);
        event::emit_with_handle(handle, event);
    }

    public(friend) fun remove_memory(agent: &mut Object<Agent>, addr: address, index: u64) {
        let agent_address = get_agent_address(agent);
        let store = borrow_mut_memory_store(agent);
        memory::remove_memory(store, addr, index);
        let event = AgentRemoveMemoryEvent {
            agent_address,
            memory_key: addr,
            memory_index: index,
        };
        let handle = event::custom_event_handle_id<address, AgentRemoveMemoryEvent>(agent_address);
        event::emit_with_handle(handle, event);
    }

    public(friend) fun compact_memory(agent: &mut Object<Agent>, addr: address, original_memory: vector<memory::Memory>, compact_memory: String) {
        let agent_address = get_agent_address(agent);
        let store = borrow_mut_memory_store(agent);
        memory::compact_memory(store, addr, original_memory, compact_memory);
        let event = AgentCompactMemoryEvent {
            agent_address,
            memory_key: addr,
            original_memory,
            compact_memory,
        };
        let handle = event::custom_event_handle_id<address, AgentCompactMemoryEvent>(agent_address);
        event::emit_with_handle(handle, event);

    }

    // ============== Internal functions ==============

    public(friend) fun create_agent_signer(agent: &mut Object<Agent>): signer {
        let agent_ref = object::borrow_mut(agent);
        account::create_signer_with_account_cap(&mut agent_ref.account_cap)
    }

    public(friend) fun update_last_active_timestamp(agent: &mut Object<Agent>) {
        let agent_ref = object::borrow_mut(agent);
        agent_ref.last_active_timestamp = timestamp::now_milliseconds();
    }

    fun borrow_mut_input_queue(agent: &mut Object<Agent>): &mut AgentInputQueue {
        if (!object::contains_field(agent, AGENT_INPUT_QUEUE_PROPERTY_NAME)) {
            object::add_field(agent, AGENT_INPUT_QUEUE_PROPERTY_NAME, AgentInputQueue {
                queue: vector[]
            });
        };
        object::borrow_mut_field(agent, AGENT_INPUT_QUEUE_PROPERTY_NAME)
    }

    public(friend) fun append_input(agent: &mut Object<Agent>, input: AgentInputInfo) {
        let input_queue = borrow_mut_input_queue(agent);
        vector::push_back(&mut input_queue.queue, input);
    }

    public fun has_pending_input(agent: &Object<Agent>): bool {
        if (!object::contains_field(agent, AGENT_INPUT_QUEUE_PROPERTY_NAME)) {
            false
        } else {
            let input_queue : &AgentInputQueue = object::borrow_field(agent, AGENT_INPUT_QUEUE_PROPERTY_NAME);
            vector::length(&input_queue.queue) > 0
        }
    }

    public(friend) fun dequeue_input(agent: &mut Object<Agent>): Option<AgentInputInfo> {
        let input_queue = borrow_mut_input_queue(agent);
        if (vector::length(&input_queue.queue) == 0) {
            option::none()
        } else {
            let input = vector::remove(&mut input_queue.queue, 0);
            option::some(input)
        }
    }

    fun borrow_mut_processing_request(agent: &mut Object<Agent>): &mut AgentProcessingRequest {
        if (!object::contains_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME)) {
            object::add_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME, AgentProcessingRequest {
                requests: vector[]
            });
        };
        object::borrow_mut_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME)
    }

    public(friend) fun add_processing_request(agent: &mut Object<Agent>, request_id: ObjectID) {
        let processing_request = borrow_mut_processing_request(agent);
        vector::push_back(&mut processing_request.requests, request_id);
    }

    public(friend) fun finish_request(agent: &mut Object<Agent>, request_id: ObjectID) {
        let processing_request = borrow_mut_processing_request(agent);
        if (vector::contains(&processing_request.requests, &request_id)) {
            vector::remove_value(&mut processing_request.requests, &request_id);
        }
    }

    public fun is_processing_request(agent: &Object<Agent>): bool {
        if (!object::contains_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME)) {
            false
        } else {
            let processing_request : &AgentProcessingRequest = object::borrow_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME);
            vector::length(&processing_request.requests) > 0
        }
    }

    public fun get_processing_requests(agent: &Object<Agent>): vector<ObjectID> {
        if (!object::contains_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME)) {
            vector[]
        } else {
            let processing_request : &AgentProcessingRequest = object::borrow_field(agent, AGENT_PROCESSING_REQUEST_PROPERTY_NAME);
            processing_request.requests
        }
    }

    fun remove_agent_cap_property(agent: &mut Object<Agent>) {
        let _cap_id: ObjectID = object::remove_field(agent, AGENT_CAP_PROPERTY_NAME);
    }

    public(friend) fun set_agent_cap_property(agent: &mut Object<Agent>, cap: &Object<AgentCap>) {
        assert!(object::id(agent) == agent_cap::get_agent_obj_id(cap), ErrorInvalidAgentCap);
        let agent_cap_id = object::id(cap);
        object::upsert_field(agent, AGENT_CAP_PROPERTY_NAME, agent_cap_id);
    }

    public fun get_agent_cap_id(agent_obj: &Object<Agent>): Option<ObjectID> {
        if (!object::contains_field(agent_obj, AGENT_CAP_PROPERTY_NAME)) { 
            option::none()
        } else {
            let agent_cap_id = *object::borrow_field(agent_obj, AGENT_CAP_PROPERTY_NAME);
            option::some(agent_cap_id)
        }
    }

    //================= Public agent update functions ==============

    /// Update agent's name
    /// Only allowed for users who possess the AgentCap for this agent
    public entry fun update_agent_name(
        cap: &mut Object<AgentCap>,
        new_name: String,
    ) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        let agent = object::borrow_mut(agent_obj);
        agent.name = new_name;
        sync_agent_profile(agent_obj);
    }

    /// Update agent's avatar
    /// Only allowed for users who possess the AgentCap for this agent
    public entry fun update_agent_avatar(
        cap: &mut Object<AgentCap>,
        new_avatar: String,
    ) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        let agent = object::borrow_mut(agent_obj);
        agent.avatar = new_avatar;
        sync_agent_profile(agent_obj);
    }

    /// Update agent's description
    /// Only allowed for users who possess the AgentCap for this agent
    public entry fun update_agent_description(
        cap: &mut Object<AgentCap>,
        new_description: String,
    ) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        let agent = object::borrow_mut(agent_obj);
        agent.description = new_description;
    }

    fun sync_agent_profile(agent_obj: &mut Object<Agent>) {
        let agent_signer = create_agent_signer(agent_obj);
        let agent = object::borrow(agent_obj);
        let profile_obj = user_profile::borrow_mut_profile(&agent_signer);
        user_profile::update_user_profile_name(profile_obj, agent.name);
        user_profile::update_user_profile_avatar(profile_obj, agent.avatar);
    }

    /// Update agent's instructions
    /// Only allowed for users who possess the AgentCap for this agent
    public entry fun update_agent_instructions(
        cap: &mut Object<AgentCap>,
        new_instructions: String,
    ) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        let agent = object::borrow_mut(agent_obj);
        let old_instructions = agent.instructions;
        agent.instructions = new_instructions;
        let event = AgentInstructionUpdateEvent {
            agent_address: agent.agent_address,
            old_instructions,
            new_instructions,
        };
        event::emit(event);
    }

    /// Update agent's temperature
    /// Only allowed for users who possess the AgentCap for this agent
    /// The temperature is a value between 0 and 2, from openai docs:
    /// https://platform.openai.com/docs/api-reference/chat/create#chat-create-temperature
    /// But we can not use float as argument, so we use u64 to represent the temperature
    /// The value between 0~20 and will be converted to 0~2
    public entry fun update_agent_temperature(
        cap: &mut Object<AgentCap>,
        new_temperature: u64,
    ) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        update_agent_temperature_internal(agent_obj, new_temperature);
    }

    fun update_agent_temperature_internal(
        agent: &mut Object<Agent>,
        new_temperature: u64,
    ) {
        let agent_ref = object::borrow_mut(agent);
        assert!(new_temperature >= 0 && new_temperature <= 20, ErrorInvalidTemperature);
        agent_ref.temperature = decimal_value::new((new_temperature as u256), 1);
    }

    public entry fun activate_agent(cap: &mut Object<AgentCap>) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        let agent = object::borrow_mut(agent_obj);
        agent.status = AGENT_STATUS_ACTIVE;
    }

    public entry fun deactivate_agent(cap: &mut Object<AgentCap>) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        let agent = object::borrow_mut(agent_obj);
        agent.status = AGENT_STATUS_INACTIVE;
    }

    //================= Task specs ==============

    public fun get_agent_task_specs_json(agent_obj: &Object<Agent>): String {
        let task_specs = get_agent_task_specs(agent_obj);
        task_spec::task_specs_to_json(&task_specs)
    }

    public fun get_agent_task_specs(agent_obj: &Object<Agent>): TaskSpecifications {
        if (object::contains_field(agent_obj, TASK_SPEC_PROPERTY_NAME)) {
            let task_specs = *object::borrow_field(agent_obj, TASK_SPEC_PROPERTY_NAME);
            task_specs
        } else {
            task_spec::empty_task_specifications()
        }
    }

    public fun get_agent_task_spec(agent_obj: &Object<Agent>, task_name: String): Option<TaskSpecification> {
        let task_specs = get_agent_task_specs(agent_obj);
        task_spec::get_task_spec_by_name(&task_specs, task_name)
    }

    public fun update_agent_task_specs(
        cap: &mut Object<AgentCap>,
        task_specs: TaskSpecifications,
    ) {
        let agent_obj_id = agent_cap::get_agent_obj_id(cap);
        let agent_obj = borrow_mut_agent(agent_obj_id);
        task_spec::validate_task_specifications(&task_specs);
        object::upsert_field(agent_obj, TASK_SPEC_PROPERTY_NAME, task_specs);
    }

    public entry fun update_agent_task_specs_entry(
        cap: &mut Object<AgentCap>,
        task_specs_json: String,
    ) {
        let task_specs = task_spec::task_specs_from_json(task_specs_json);
        update_agent_task_specs(cap, task_specs);
    }

    entry fun fix_agent_username(agent_obj: &mut Object<Agent>) {
        let agent = object::borrow_mut(agent_obj);
        let lowercase_username = string_utils::to_lower_case(&agent.username);
        agent.username = lowercase_username;
    }


    #[test_only]
    /// Create a test agent for unit testing
    public fun create_default_test_agent(): (&mut Object<Agent>, Object<AgentCap>) {
        use std::string;

        create_test_agent(
            string::utf8(b"Test Assistant"),
            string::utf8(b"test_assistant"),
            string::utf8(b"https://test/avator.png"),
            string::utf8(b"A helpful test assistant"),
            string::utf8(b"General knowledge")
        )
    }

    #[test_only]
    public fun create_test_agent(name: String, username: String, avatar: String, description: String, instructions: String): (&mut Object<Agent>, Object<AgentCap>) {
        use moveos_std::object;
        use rooch_framework::gas_coin;
        
        let initial_fee = gas_coin::mint_for_test(config::get_ai_agent_initial_fee());
        let agent_cap = create_agent_with_initial_fee(name, username, avatar, description, instructions, initial_fee);
        
        let agent_obj_id = agent_cap::get_agent_obj_id(&agent_cap);
        let agent_obj = object::borrow_mut_object_shared<Agent>(agent_obj_id);
        (agent_obj, agent_cap)
    }

    #[test]
    fun test_create_default_test_agent() {
        nuwa_framework::genesis::init_for_test();
        let (agent, agent_cap) = create_default_test_agent();
        assert!(object::is_shared(agent), 1);
        assert!(get_agent_cap_id(agent) == option::some(object::id(&agent_cap)), 2);
        destroy_agent_cap(agent, agent_cap);
        let agent_cap_id = get_agent_cap_id(agent);
        std::debug::print(&agent_cap_id);
        assert!(option::is_none(&agent_cap_id), 3);
    }

    #[test]
    fun test_update_agent_temperature() {
        use nuwa_framework::ai_request;
        use moveos_std::json;
        nuwa_framework::genesis::init_for_test();
        let (agent, agent_cap) = create_default_test_agent();
        update_agent_temperature_internal(agent, 19);
        let temperature = get_agent_temperature(agent);
        let request = ai_request::new_chat_request(string::utf8(b"gpt-4o"), vector[], temperature);
        let request_json = string::utf8(json::to_json(&request));
        std::debug::print(&request_json);
        destroy_agent_cap(agent, agent_cap);
    }
}