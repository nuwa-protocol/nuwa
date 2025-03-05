#[test_only]
module nuwa_framework::agent_tests {
    use std::debug;
    use std::string;
    use std::vector;
    use nuwa_framework::character;
    use nuwa_framework::action;
    use nuwa_framework::action_dispatcher;
    use nuwa_framework::agent;
    use nuwa_framework::agent_runner;
    use nuwa_framework::channel;
    use nuwa_framework::message;


    #[test]
    fun test_prompt_builder() {
        rooch_framework::genesis::init_for_test();
        // Initialize actions
        action::init_for_test();
        action_dispatcher::init_for_test();

        // Create test character with more detailed personality
        let char_data = character::new_character_data(
            string::utf8(b"MoveGuide"),
            string::utf8(b"move_guide"),
            string::utf8(b"A specialized Move programming assistant with expertise in blockchain development"),
            vector[
                string::utf8(b"Patient and methodical in explanations"),
                string::utf8(b"Always provides practical code examples"),
                string::utf8(b"Focuses on best practices and security"),
                string::utf8(b"Adapts explanations to user's skill level"),
                string::utf8(b"Encourages learning through hands-on coding")
            ],
            vector[
                string::utf8(b"Move language and smart contract development"),
                string::utf8(b"Blockchain architecture and principles"),
                string::utf8(b"Smart contract security and auditing"),
                string::utf8(b"Development tools and testing frameworks"),
                string::utf8(b"Resource-oriented programming concepts")
            ]
        );
        let character_obj = character::create_character(char_data);
        let (agent, cap) = agent::create_test_agent_with_character(character_obj);
        
        // Create AI home channel
        let channel_id = channel::create_ai_home_channel(agent);
       
        let test_user = @0x43;

        // First interaction: User introduces themselves
        let test_message = message::new_message_for_test(
            1,
            channel_id,
            test_user,
            string::utf8(b"Hi, I'm Alex. I prefer learning with real code examples and practical projects. I'm very interested in Move smart contracts and blockchain development. Could you help me learn?"),
            message::type_user(),
            vector::empty()
        );
        
        
        let agent_input = message::new_agent_input(vector[test_message]);
        std::debug::print(&agent_input);
        // Get first prompt
        let prompt = agent_runner::generate_system_prompt(agent, agent_input);

        // Print first prompt for debugging
        debug::print(&string::utf8(b"First Prompt:"));
        debug::print(string::bytes(&prompt));

        // Clean up
        channel::delete_channel_for_testing(channel_id);
        agent::destroy_agent_cap(cap);
    }
}