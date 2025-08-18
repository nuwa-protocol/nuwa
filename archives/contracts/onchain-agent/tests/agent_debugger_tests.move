#[test_only]
module nuwa_framework::agent_debugger_tests {
    use std::debug;
    use std::string;
    use std::vector;
    use moveos_std::decimal_value;
    use nuwa_framework::agent;
    use nuwa_framework::agent_debugger;


    #[test]
    fun test_make_debug_ai_request() {
        // Initialize test environment
        nuwa_framework::genesis::init_for_test();

        // Create test agent
        let (agent, cap) = agent::create_test_agent(
            string::utf8(b"TestAgent"),
            string::utf8(b"test_agent"),
            string::utf8(b"https://test/avatar.png"),
            string::utf8(b"A test agent for debugging"),
            string::utf8(b"Test instructions"),
        );

        // Create test debug message
        let debug_msg = agent_debugger::new_debug_message(
            1,
            @0x42,
            string::utf8(b"Test debug message"),
            1000,
            vector::empty()
        );

        // Create debug input
        let messages = vector::singleton(debug_msg);
        let temperature = decimal_value::new(7, 1); // 0.7
        let mock_rgas_amount = 1000000000u256;
        let debug_input = agent_debugger::new_debug_input_v2(
            string::utf8(b"Test instructions"),
            messages,
            temperature,
            mock_rgas_amount
        );

        // Convert debug input to JSON string
        let message_json = string::utf8(moveos_std::json::to_json(&debug_input));

        // Make debug AI request
        let request_json = agent_debugger::make_debug_ai_request(agent, message_json);
        
        // Print request JSON for debugging
        debug::print(&string::utf8(b"Debug AI Request:"));
        debug::print(&request_json);

        // Clean up
        agent::destroy_agent_cap(agent, cap);
    }

} 