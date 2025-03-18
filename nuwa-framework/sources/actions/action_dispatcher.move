module nuwa_framework::action_dispatcher {
    use std::string::{Self, String};
    use std::vector;
    use std::option::{Self, Option};
    use moveos_std::json;
    use moveos_std::object::{Object, ObjectID};
    use moveos_std::result::{Self, is_ok, is_err, err_str, Result};
    use nuwa_framework::memory_action;
    use nuwa_framework::response_action;
    use nuwa_framework::transfer_action;
    use nuwa_framework::task_action;
    use nuwa_framework::agent::Agent;
    use nuwa_framework::string_utils;
    use nuwa_framework::action::{ActionDescription, ActionGroup};
    use nuwa_framework::agent_input_info::{Self, AgentInputInfo};

    friend nuwa_framework::ai_callback;
    
    #[data_struct]
    struct ActionCall has copy, drop {
        action: String,
        /// JSON string containing action-specific arguments
        args: String,  
    }

    #[data_struct]
    /// Response structure from AI - contains a vector of action calls
    /// Each action call has:
    /// - "action": specifies the action name, e.g., "memory::add"
    /// - "args": contains a JSON object string with action-specific parameters
    struct ActionResponse has copy, drop {
        actions: vector<ActionCall>
    }

    struct ActionEvent has copy, drop, store{
        action: String,
        args: String,
        success: bool,
        error: String,
    }

    //TODO remove this
    entry fun register_actions() {
    }

    public fun get_action_groups(): vector<ActionGroup> {
        let groups = vector::empty();
        let memory_group = memory_action::get_action_group();
        vector::push_back(&mut groups, memory_group);
        let response_group = response_action::get_action_group();
        vector::push_back(&mut groups, response_group);
        let transfer_group = transfer_action::get_action_group();
        vector::push_back(&mut groups, transfer_group);
        groups
    }

    public fun get_action_descriptions(): vector<ActionDescription> {
        let descriptions = vector::empty();

        // Register memory actions
        let memory_descriptions = memory_action::get_action_descriptions();
        vector::append(&mut descriptions, memory_descriptions);

        // Register response actions
        let response_descriptions = response_action::get_action_descriptions();
        vector::append(&mut descriptions, response_descriptions);

        // Register transfer actions
        let transfer_descriptions = transfer_action::get_action_descriptions();
        vector::append(&mut descriptions, transfer_descriptions);

        descriptions
    }
 
    public(friend) fun dispatch_actions_internal(agent: &mut Object<Agent>, agent_input: AgentInputInfo, response: String) {
        let action_response = parse_line_based_response(&response);
        let actions = action_response.actions;
        let i = 0;
        let len = vector::length(&actions);
        let default_channel_id = agent_input_info::get_response_channel_id(&agent_input);
        if (len == 0) {
            //If the AI response format is not correct, reply to the current message
            response_action::reply_to_current_message(agent, &agent_input, response);
            return
        };
        while (i < len) {
            let action_call = vector::borrow(&actions, i);
            execute_action(agent, &agent_input, default_channel_id, action_call);
            i = i + 1;
        };
    }

    /// Execute a single action call
    fun execute_action(agent: &mut Object<Agent>, agent_input: &AgentInputInfo, default_channel_id: ObjectID, action_call: &ActionCall) {
        let action_name = &action_call.action;
        let args = &action_call.args;
        let skip_event = false;
        let result: Result<bool,String> = if (string_utils::starts_with(action_name, &b"memory::")) {
            let result = memory_action::execute_internal(agent, agent_input, *action_name, *args);
            if(is_ok(&result)){
                //if the memory action is none, skip the event
                let updated_memory:bool = result::unwrap(result);
                if(!updated_memory){
                    skip_event = true;
                };
            };
            result
        } else if (string_utils::starts_with(action_name, &b"response::")) {
            //skip all response actions
            skip_event = true;
            response_action::execute_internal(agent, agent_input, *action_name, *args)
        } else if (string_utils::starts_with(action_name, &b"transfer::")) {
            transfer_action::execute_internal(agent, agent_input, *action_name, *args)
        } else if (string_utils::starts_with(action_name, &b"task::")) {
            task_action::execute_internal(agent, agent_input, *action_name, *args)
        } else {
            err_str(b"Unsupported action")
        };
        if (!skip_event) {
            let event = ActionEvent {
                action: *action_name,
                args: *args,
                success: is_ok(&result),
                error: if (is_err(&result)) { result::unwrap_err(result) } else { string::utf8(b"") },
            };
            response_action::send_event_to_channel(agent, default_channel_id, string::utf8(json::to_json(&event)));
        };
    }

    /// Parse JSON response into ActionResponse
    public fun parse_response(json_str: String): ActionResponse {
        json::from_json<ActionResponse>(string::into_bytes(json_str))
    }
    
    /// Get actions from ActionResponse
    public fun get_actions(response: &ActionResponse): &vector<ActionCall> {
        &response.actions
    }

    /// Get action name from ActionCall
    public fun get_action_name(action_call: &ActionCall): &String {
        &action_call.action
    }

    /// Get action arguments from ActionCall
    public fun get_action_args(action_call: &ActionCall): &String {
        &action_call.args
    }

    /// Create an action call with a raw string args
    public fun create_action_call(action: String, args_json: String): ActionCall {
        ActionCall { action, args: args_json }
    }

    /// Create an action call with any serializable args type
    /// This provides a type-safe way to create action calls
    public fun create_action_call_with_object<T: copy + drop>(action: String, args: T): ActionCall {
        let args_json = string::utf8(json::to_json(&args));
        ActionCall { action, args: args_json }
    }

    /// Create a new empty ActionResponse
    public fun create_empty_response(): ActionResponse {
        ActionResponse { actions: vector::empty() }
    }

    /// Add an action to an ActionResponse
    public fun add_action(response: &mut ActionResponse, action_call: ActionCall) {
        vector::push_back(&mut response.actions, action_call);
    }

    /// Convert ActionResponse to JSON string
    public fun response_to_json(response: &ActionResponse): String {
        string::utf8(json::to_json(response))
    }    

    /// Create an ActionResponse from a vector of ActionCalls
    public fun create_action_response(actions: vector<ActionCall>): ActionResponse {
        ActionResponse { actions }
    }

    /// Parse a line-based response string into an ActionResponse
    /// Handle various edge cases and try to fix common formatting issues:
    /// 1. No line breaks between actions
    /// 2. Missing or malformed JSON
    /// 3. Extra spaces or formatting issues
    public fun parse_line_based_response(response: &String): ActionResponse {
        let actions = vector::empty<ActionCall>();
        
        // First try to split by newline
        let lines = string_utils::split(response, &string::utf8(b"\n"));
        
        let i = 0;
        let len = vector::length(&lines);
        
        while (i < len) {
            let line = string_utils::trim(vector::borrow(&lines, i));
            
            if (!string::is_empty(&line)) {
                let maybe_action = try_extract_action(&line);
                if (option::is_some(&maybe_action)) {
                    vector::push_back(&mut actions, option::extract(&mut maybe_action));
                };
            };
            i = i + 1;
        };
        
        ActionResponse { actions }
    }

    /// Try to fix common JSON formatting issues
    fun fix_json_args(args: &String): String {
        if (string::is_empty(args)) {
            return string::utf8(b"{}")
        };
        
        let args_str = string_utils::trim(args);
        
        // If doesn't start with {, wrap it
        if (!string_utils::starts_with(&args_str, &b"{")) {
            if (string_utils::contains(&args_str, &b":")) {
                // Might be JSON without braces
                let result = string::utf8(b"{");
                string::append(&mut result, args_str);
                string::append(&mut result, string::utf8(b"}"));
                return result
            } else {
                // Treat as content parameter
                let result = string::utf8(b"{\"content\":\"");
                string::append(&mut result, args_str);
                string::append(&mut result, string::utf8(b"\"}"));
                return result
            }
        };
        
        args_str
    }

    /// Try to extract action from a line without proper spacing
    fun try_extract_action(line: &String): Option<ActionCall> {
        // Common action prefixes we recognize
        let prefixes = vector[
            b"memory::", 
            b"response::", 
            b"transfer::",
            b"task::"
        ];
        
        let i = 0;
        let len = vector::length(&prefixes);
        
        while (i < len) {
            let prefix = vector::borrow(&prefixes, i);
            if (string_utils::starts_with(line, prefix)) {
                // Found a valid prefix, try to split after the action name
                let line_str = string::bytes(line);
                let j = vector::length(prefix);
                let line_len = vector::length(line_str);
                
                while (j < line_len) {
                    if (*vector::borrow(line_str, j) == 0x3A || // :
                        *vector::borrow(line_str, j) == 0x20) { // space
                        let action = string::utf8(string_utils::get_substr(line_str, 0, j));
                        let args = if (j + 1 < line_len) {
                            string::utf8(string_utils::get_substr(line_str, j + 1, line_len))
                        } else {
                            string::utf8(b"{}")
                        };
                        
                        return option::some(create_action_call(
                            string_utils::trim(&action),
                            fix_json_args(&args)
                        ))
                    };
                    j = j + 1;
                };
                
                // If we reach here, no separator was found, treat the whole thing as the action name
                let action = string::utf8(string_utils::get_substr(line_str, 0, line_len));
                return option::some(create_action_call(
                    string_utils::trim(&action),
                    string::utf8(b"{}")
                ))
            };
            i = i + 1;
        };
        
        option::none()
    }

    /// Convert ActionResponse to string format
    public fun response_to_str(response: &ActionResponse): String {
        let result = string::utf8(b"");
        let actions = &response.actions;
        let len = vector::length(actions);
        let i = 0;
        
        while (i < len) {
            let action_call = vector::borrow(actions, i);
            
            // Add action name
            string::append(&mut result, action_call.action);
            string::append(&mut result, string::utf8(b" "));
            
            // Add parameters
            string::append(&mut result, action_call.args);
            
            // Add newline if not the last action
            if (i + 1 < len) {
                string::append(&mut result, string::utf8(b"\n"));
            };
            
            i = i + 1;
        };
        
        result
    }

    #[test]
    fun test_dispatch_actions() {
        use nuwa_framework::agent;
        use nuwa_framework::memory;
        use nuwa_framework::memory_action;
        use nuwa_framework::response_action;
        use nuwa_framework::channel;
        use nuwa_framework::message;
        use nuwa_framework::agent_input;
        use nuwa_framework::message_for_agent;
        use rooch_framework::gas_coin::RGas;

        // Initialize
        nuwa_framework::genesis::init_for_test();

        let (agent, cap) = agent::create_default_test_agent();
        let test_addr = @0x42;
       

        let channel_id = channel::create_ai_home_channel(agent);
       
        // Using type-specific constructors with serialization
        let memory_args = memory_action::create_remember_user_args(
            string::utf8(b"User prefers detailed explanations"), 
            string::utf8(b"preference"),
            true,
        );
        
        let response_args = response_action::create_say_args(
            string::utf8(b"I understand you prefer detailed explanations.")
        );

        let memory_action = create_action_call_with_object(
            memory_action::action_name_remember_user(),
            memory_args
        );
        
        let response_action = create_action_call_with_object(
            response_action::action_name_say(), 
            response_args
        );

        // Alternative fluent API style
        let mut_response = create_empty_response();
        add_action(&mut mut_response, memory_action);
        add_action(&mut mut_response, response_action);
        let test_response = response_to_str(&mut_response);

        let message = message::new_message_for_test(
            1,
            channel_id,
            test_addr,
            string::utf8(b"Hi, I'm Alex. I prefer learning with real code examples and practical projects. I'm very interested in Move smart contracts and blockchain development. Could you help me learn?"),
            message::type_normal(),
            vector::empty(),
            0
        );
        let coin_input_info = agent_input_info::new_coin_input_info_by_type<RGas>(1000000000000000000u256);
        let agent_input = message_for_agent::new_agent_input(vector[message]);
        let agent_input_info = agent_input::into_agent_input_info(agent_input, coin_input_info);

        // Execute actions
        dispatch_actions_internal(agent, agent_input_info, test_response);

        // Verify memory was added
        let store = agent::borrow_memory_store(agent);
        let memories = memory::get_context_memories(store, test_addr);
        assert!(vector::length(&memories) == 1, 1);
        let memory = vector::borrow(&memories, 0);
        assert!(memory::get_content(memory) == string::utf8(b"User prefers detailed explanations"), 2);
        assert!(memory::get_context(memory) == string::utf8(b"preference"), 3);

        agent::destroy_agent_cap(cap);
    }

    #[test_only]
    #[data_struct]
    struct TestArgs has copy, drop {
        value: u64
    }

    #[test]
    fun test_response_builder() {
        // Test the fluent API for building responses
        let mut_response = create_empty_response();
        
        // Add a simple action with raw JSON
        add_action(&mut mut_response, create_action_call(
            string::utf8(b"response::say"),
            string::utf8(b"{\"content\":\"Hello world!\"}")
        ));
        
        add_action(&mut mut_response, create_action_call_with_object(
            string::utf8(b"test::action"),
            TestArgs { value: 42 }
        ));
        
        // Convert to JSON
        let json = response_to_json(&mut_response);
        
        // Parse back and verify
        let parsed = parse_response(json);
        let actions = get_actions(&parsed);
        assert!(vector::length(actions) == 2, 1);
        
        assert!(vector::borrow(actions, 0).action == string::utf8(b"response::say"), 2);
        assert!(vector::borrow(actions, 1).action == string::utf8(b"test::action"), 3);
    }

    #[test]
    fun test_response_to_str() {
        let mut_response = create_empty_response();
        
        add_action(&mut mut_response, create_action_call(
            string::utf8(b"memory::add"),
            string::utf8(b"{\"target\":\"0x42\",\"content\":\"test content\"}")
        ));
        
        add_action(&mut mut_response, create_action_call(
            string::utf8(b"response::say"),
            string::utf8(b"{\"channel_id\":\"0x123\",\"content\":\"Hello\"}")
        ));
        
        let str = response_to_str(&mut_response);
        
        // Parse back and verify
        let parsed = parse_line_based_response(&str);
        let actions = get_actions(&parsed);
        assert!(vector::length(actions) == 2, 1);
        
        let first_action = vector::borrow(actions, 0);
        assert!(get_action_name(first_action) == &string::utf8(b"memory::add"), 2);
        assert!(get_action_args(first_action) == &string::utf8(b"{\"target\":\"0x42\",\"content\":\"test content\"}"), 3);
        
        let second_action = vector::borrow(actions, 1);
        assert!(get_action_name(second_action) == &string::utf8(b"response::say"), 4);
        assert!(get_action_args(second_action) == &string::utf8(b"{\"channel_id\":\"0x123\",\"content\":\"Hello\"}"), 5);
    }

    #[test]
    fun test_parse_line_based_response() {
        // Test line-based format
        let response = string::utf8(b"memory::add {\"target\":\"0x42\",\"content\":\"test content\"}\nresponse::say {\"channel_id\":\"0x123\",\"content\":\"Hello\"}");
        let action_response = parse_line_based_response(&response);
        let actions = get_actions(&action_response);
        
        assert!(vector::length(actions) == 2, 1);
        
        let first_action = vector::borrow(actions, 0);
        assert!(get_action_name(first_action) == &string::utf8(b"memory::add"), 2);
        
        let second_action = vector::borrow(actions, 1);
        assert!(get_action_name(second_action) == &string::utf8(b"response::say"), 3);
    }



    #[test]
    fun test_parse_malformed_responses() {
        // Test case 1: Missing braces in JSON
        let response1 = string::utf8(b"response::say content:\"Hello world\"");
        let result1 = parse_line_based_response(&response1);
        let actions1 = get_actions(&result1);
        assert!(vector::length(actions1) == 1, 1);
        let action1 = vector::borrow(actions1, 0);
        assert!(get_action_name(action1) == &string::utf8(b"response::say"), 2);
        assert!(get_action_args(action1) == &string::utf8(b"{content:\"Hello world\"}"), 3);

        // Test case 2: No JSON at all, just plain text
        let response2 = string::utf8(b"response::say Hello world");
        let result2 = parse_line_based_response(&response2);
        let actions2 = get_actions(&result2);
        assert!(vector::length(actions2) == 1, 4);
        let action2 = vector::borrow(actions2, 0);
        assert!(get_action_name(action2) == &string::utf8(b"response::say"), 5);
        assert!(get_action_args(action2) == &string::utf8(b"{\"content\":\"Hello world\"}"), 6);

        // Test case 3: Multiple actions without proper formatting
        let response3 = string::utf8(b"memory::remember_user likes coding\nresponse::say:Great!");
        let result3 = parse_line_based_response(&response3);
        let actions3 = get_actions(&result3);
        assert!(vector::length(actions3) == 2, 7);
        let action3_1 = vector::borrow(actions3, 0);
        let action3_2 = vector::borrow(actions3, 1);
        assert!(get_action_name(action3_1) == &string::utf8(b"memory::remember_user"), 8);
        assert!(get_action_name(action3_2) == &string::utf8(b"response::say"), 9);

        // Test case 4: Action without parameters
        let response4 = string::utf8(b"memory::clear");
        let result4 = parse_line_based_response(&response4);
        let actions4 = get_actions(&result4);
        assert!(vector::length(actions4) == 1, 10);
        let action4 = vector::borrow(actions4, 0);
        assert!(get_action_name(action4) == &string::utf8(b"memory::clear"), 11);
        assert!(get_action_args(action4) == &string::utf8(b"{}"), 12);

        // Test case 5: Mixed format actions
        let response5 = string::utf8(b"response::say {\"content\":\"Hello\"}\nmemory::remember_user:likes formal json\nresponse::say Bye!");
        let result5 = parse_line_based_response(&response5);
        let actions5 = get_actions(&result5);
        assert!(vector::length(actions5) == 3, 13);
        
        // Test case 6: Empty lines and whitespace
        let response6 = string::utf8(b"\n  response::say hello  \n\n  memory::clear  \n");
        let result6 = parse_line_based_response(&response6);
        let actions6 = get_actions(&result6);
        assert!(vector::length(actions6) == 2, 14);
        let action6_1 = vector::borrow(actions6, 0);
        let action6_2 = vector::borrow(actions6, 1);
        assert!(get_action_name(action6_1) == &string::utf8(b"response::say"), 15);
        assert!(get_action_name(action6_2) == &string::utf8(b"memory::clear"), 16);

        // Test case 7: Invalid action prefix
        let response7 = string::utf8(b"invalid::action test\nresponse::say valid action");
        let result7 = parse_line_based_response(&response7);
        let actions7 = get_actions(&result7);
        assert!(vector::length(actions7) == 1, 17); // Should only parse the valid action
        let action7 = vector::borrow(actions7, 0);
        assert!(get_action_name(action7) == &string::utf8(b"response::say"), 18);
    }

    #[test]
    fun test_fix_json_args() {
        // Test empty args
        let empty = string::utf8(b"");
        assert!(fix_json_args(&empty) == string::utf8(b"{}"), 1);

        // Test plain text
        let plain_text = string::utf8(b"Hello world");
        let expected = string::utf8(b"{\"content\":\"");
        string::append(&mut expected, string::utf8(b"Hello world"));
        string::append(&mut expected, string::utf8(b"\"}"));
        assert!(fix_json_args(&plain_text) == expected, 2);

        // Test JSON without braces
        let no_braces = string::utf8(b"content:\"test\",type:\"message\"");
        let expected2 = string::utf8(b"{");
        string::append(&mut expected2, string::utf8(b"content:\"test\",type:\"message\""));
        string::append(&mut expected2, string::utf8(b"}"));
        assert!(fix_json_args(&no_braces) == expected2, 3);

        // Test proper JSON
        let proper_json = string::utf8(b"{\"content\":\"test\"}");
        assert!(fix_json_args(&proper_json) == string::utf8(b"{\"content\":\"test\"}"), 4);

        // Test with extra spaces
        let spaced = string::utf8(b"  {\"content\":\"test\"}  ");
        assert!(fix_json_args(&spaced) == string::utf8(b"{\"content\":\"test\"}"), 5);
    }

    #[test]
    fun test_try_extract_action() {
        // Test valid action with colon
        let line1 = string::utf8(b"response::say:Hello");
        let result1 = try_extract_action(&line1);
        assert!(option::is_some(&result1), 1);
        let action1 = option::extract(&mut result1);
        assert!(get_action_name(&action1) == &string::utf8(b"response::say"), 2);
        let expected1 = string::utf8(b"{\"content\":\"");
        string::append(&mut expected1, string::utf8(b"Hello"));
        string::append(&mut expected1, string::utf8(b"\"}"));
        assert!(get_action_args(&action1) == &expected1, 3);

        // Test valid action with space
        let line2 = string::utf8(b"memory::remember_user test");
        let result2 = try_extract_action(&line2);
        assert!(option::is_some(&result2), 4);
        let action2 = option::extract(&mut result2);
        assert!(get_action_name(&action2) == &string::utf8(b"memory::remember_user"), 5);

        // Test invalid action prefix
        let line3 = string::utf8(b"invalid::action test");
        let result3 = try_extract_action(&line3);
        assert!(option::is_none(&result3), 6);

        // Test action without parameters
        let line4 = string::utf8(b"memory::clear");
        let result4 = try_extract_action(&line4);
        assert!(option::is_some(&result4), 7);
        let action4 = option::extract(&mut result4);
        assert!(get_action_name(&action4) == &string::utf8(b"memory::clear"), 8);
        assert!(get_action_args(&action4) == &string::utf8(b"{}"), 9);
    } 
}