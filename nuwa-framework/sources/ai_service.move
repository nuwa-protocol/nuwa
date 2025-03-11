module nuwa_framework::ai_service {
    use std::string;
    use std::vector;
    use std::option::{Self, Option};
    use std::signer;
    use std::u256;
    use moveos_std::object::ObjectID;
    use moveos_std::account;
    use verity::oracles;
    use verity::registry;
    use rooch_framework::account_coin_store;
    use rooch_framework::gas_coin::RGas;

    use nuwa_framework::ai_request::{Self, ChatRequest};
    use nuwa_framework::agent_input::{AgentInputInfo, AgentInputInfoV2};

    friend nuwa_framework::ai_callback;
    friend nuwa_framework::agent;
    friend nuwa_framework::agent_runner;

    const ORACLE_ADDRESS: address = @0x694cbe655b126e9e6a997e86aaab39e538abf30a8c78669ce23a98740b47b65d;
    const NOTIFY_CALLBACK: vector<u8> = b"ai_callback::process_response_v2";
    /// Default gas allocation for notification callbacks 0.6 RGas
    const DEFAULT_NOTIFICATION_GAS: u256 = 200000000;
    const DEFAULT_ORACLE_FEE: u256 = 3200000000;

    const AI_ORACLE_HEADERS: vector<u8> = b"{}";
    const AI_ORACLE_METHOD: vector<u8> = b"POST";

    /// The path to the message content in the oracle response
    /// We directly get the root, if we want to get the first choice we can use ".choices[].message.content"
    const AI_PICK: vector<u8> = b".";
    const AI_ORACLE_URL: vector<u8> = b"https://api.openai.com/v1/chat/completions";
    const MAX_HISTORY_MESSAGES: u64 = 20;
    const MAX_RESPONSE_LENGTH: u64 = 65536;

    const ErrorInvalidDepositAmount: u64 = 1;
    const ErrorInsufficientBalance: u64 = 2;

    struct PendingRequest has copy, drop, store {
        request_id: ObjectID,
        agent_obj_id: ObjectID,
    }

    struct PendingRequestV2 has copy, drop, store {
        request_id: ObjectID,
        agent_obj_id: ObjectID,
        agent_input_info: AgentInputInfo,
    }

    struct PendingRequestV3 has copy, drop, store {
        request_id: ObjectID,
        agent_obj_id: ObjectID,
        agent_input_info: AgentInputInfoV2,
    }

    struct Requests has key {
        pending: vector<PendingRequest>,
    }

    struct RequestsV2 has key {
        pending: vector<PendingRequestV2>,
    }

    struct RequestsV3 has key {
        pending: vector<PendingRequestV3>,
    }

    fun init() {
        let signer = moveos_std::signer::module_signer<Requests>();
        account::move_resource_to(&signer, Requests { 
            pending: vector::empty() 
        });
        init_v2();
    }

    entry fun init_v2() {
        let signer = moveos_std::signer::module_signer<RequestsV2>();
        account::move_resource_to(&signer, RequestsV2 { 
            pending: vector::empty() 
        });
    }

    entry fun init_v3() {
        let signer = moveos_std::signer::module_signer<RequestsV3>();
        account::move_resource_to(&signer, RequestsV3 { 
            pending: vector::empty() 
        });
    }

    public(friend) fun request_ai(
        from: &signer,
        agent_obj_id: ObjectID,
        agent_input_info: AgentInputInfoV2,
        request: ChatRequest,
    ) {
        let url = string::utf8(AI_ORACLE_URL);
        let method = string::utf8(AI_ORACLE_METHOD);
        let headers = string::utf8(AI_ORACLE_HEADERS);
        
        // Use ai_request to build the chat context
        let body = string::utf8(ai_request::to_json(&request));
        
        let pick = string::utf8(AI_PICK);
        let http_request = oracles::build_request(url, method, headers, body);
        
        let option_min_amount = registry::estimated_cost(ORACLE_ADDRESS, url, string::length(&body), MAX_RESPONSE_LENGTH);
        
        let estimated_fee: u256 = if(option::is_some(&option_min_amount)) {
            option::destroy_some(option_min_amount)
        } else {
            DEFAULT_ORACLE_FEE
        };
        let oracle_fee = u256::max(estimated_fee, DEFAULT_ORACLE_FEE);
        let oracle_fee = oracle_fee + DEFAULT_NOTIFICATION_GAS;
        
        let from_addr = signer::address_of(from);
        let oracle_balance = oracles::get_user_balance(from_addr);
        if(oracle_balance < oracle_fee) {
            let pay_mee = oracle_fee - oracle_balance;
            let gas_balance = account_coin_store::balance<RGas>(from_addr);
            assert!(gas_balance >= pay_mee, ErrorInsufficientBalance);
            oracles::deposit_to_escrow(from, pay_mee);
        };

        oracles::update_notification_gas_allocation(from, @nuwa_framework, string::utf8(NOTIFY_CALLBACK), DEFAULT_NOTIFICATION_GAS);
        
        let request_id = oracles::new_request(
            http_request, 
            pick, 
            ORACLE_ADDRESS, 
            oracles::with_notify(@nuwa_framework, string::utf8(NOTIFY_CALLBACK))
        );

        // Store request information with agent ID
        let requests = account::borrow_mut_resource<RequestsV3>(@nuwa_framework);
        vector::push_back(&mut requests.pending, PendingRequestV3 { 
            request_id,
            agent_obj_id,
            agent_input_info,
        });
        
    }

    public fun get_pending_requests(): vector<PendingRequest> {
        let requests = account::borrow_resource<Requests>(@nuwa_framework);
        *&requests.pending
    }

    public fun unpack_pending_request(request: PendingRequest): (ObjectID, ObjectID) {
        (request.request_id, request.agent_obj_id)
    }

    public fun get_pending_requests_v2(): vector<PendingRequestV2> {
        let requests = account::borrow_resource<RequestsV2>(@nuwa_framework);
        *&requests.pending
    }

    public fun unpack_pending_request_v2(request: PendingRequestV2): (ObjectID, ObjectID, AgentInputInfo) {
        (request.request_id, request.agent_obj_id, request.agent_input_info)
    }

    public fun get_pending_requests_v3(): vector<PendingRequestV3> {
        let requests = account::borrow_resource<RequestsV3>(@nuwa_framework);
        *&requests.pending
    }

    public fun unpack_pending_request_v3(request: PendingRequestV3): (ObjectID, ObjectID, AgentInputInfoV2) {
        (request.request_id, request.agent_obj_id, request.agent_input_info)
    }

    public fun take_pending_request_by_id(request_id: ObjectID): Option<PendingRequestV3> {
        //TODO use a key-value store to optimize the lookup
        let requests = account::borrow_mut_resource<RequestsV3>(@nuwa_framework);
        let i = 0;
        let len = vector::length(&requests.pending);
        while (i < len) {
            if (vector::borrow(&requests.pending, i).request_id == request_id) {
                return option::some(vector::remove(&mut requests.pending, i))
            };
            i = i + 1;
        };
        option::none()
    }

    public(friend) fun remove_request(request_id: ObjectID) {
        let requests = account::borrow_mut_resource<RequestsV3>(@nuwa_framework);
        let i = 0;
        let len = vector::length(&requests.pending);
        while (i < len) {
            if (vector::borrow(&requests.pending, i).request_id == request_id) {
                vector::remove(&mut requests.pending, i);
                break
            };
            i = i + 1;
        };
    }

    public fun get_user_oracle_fee_balance(user_addr: address): u256 {
        oracles::get_user_balance(user_addr)
    }

    public entry fun withdraw_user_oracle_fee(caller: &signer, amount: u256) {
        oracles::withdraw_from_escrow(caller, amount)
    }

    public entry fun withdraw_all_user_oracle_fee(caller: &signer) {
        let balance = oracles::get_user_balance(signer::address_of(caller));
        oracles::withdraw_from_escrow(caller, balance)
    }

    public entry fun deposit_user_oracle_fee(caller: &signer, amount: u256) {
        // Check user's RGas balance
        let caller_addr = signer::address_of(caller);
        let gas_balance = account_coin_store::balance<RGas>(caller_addr);
        assert!(gas_balance >= amount, ErrorInsufficientBalance);
        
        oracles::deposit_to_escrow(caller, amount)
    }

    #[test]
    fun test_oracle_fee_operations() {
        oracles::init_for_test();

        // Initialize test accounts
        let alice = account::create_signer_for_testing(@0x77);
        let alice_addr = signer::address_of(&alice);

        // Setup test account with initial RGas
        let fee_amount: u256 = 1000000000; // 10 RGas
        rooch_framework::gas_coin::faucet_entry(&alice, fee_amount);

        // Test Case 1: Check initial balance
        {
            let initial_balance = get_user_oracle_fee_balance(alice_addr);
            assert!(initial_balance == 0, 1);
        };

        // Test Case 2: Deposit and check balance
        {
            deposit_user_oracle_fee(&alice, fee_amount);
            let balance = get_user_oracle_fee_balance(alice_addr);
            assert!(balance == fee_amount, 2);
        };

        // Test Case 3: Partial withdrawal
        {
            let withdraw_amount = fee_amount / 2;
            withdraw_user_oracle_fee(&alice, withdraw_amount);
            let balance = get_user_oracle_fee_balance(alice_addr);
            assert!(balance == withdraw_amount, 3);
        };

        // Test Case 4: Withdraw all remaining balance
        {
            withdraw_all_user_oracle_fee(&alice);
            let balance = get_user_oracle_fee_balance(alice_addr);
            assert!(balance == 0, 4);
        };
    }
}