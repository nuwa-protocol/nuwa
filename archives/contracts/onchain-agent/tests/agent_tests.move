#[test_only]
module nuwa_framework::agent_tests {
    use std::debug;
    use std::string;
    use std::vector;
    use moveos_std::signer;
    use moveos_std::object;
    use rooch_framework::gas_coin::RGas;
    use nuwa_framework::agent::{Self, Agent};
    use nuwa_framework::agent_runner;
    use nuwa_framework::agent_input;
    use nuwa_framework::channel;
    use nuwa_framework::message;
    use nuwa_framework::agent_input_info;
    use nuwa_framework::message_for_agent;
    use nuwa_framework::prompt_input;
    use nuwa_framework::user_profile;
    use nuwa_framework::user_profile_for_agent;
    use nuwa_framework::test_helper;
    
    #[test]
    fun test_prompt_builder() {
        nuwa_framework::genesis::init_for_test();

        let (agent, cap) = agent::create_test_agent(
            string::utf8(b"MoveGuide"),
            string::utf8(b"move_guide"),
            string::utf8(b"https://test/avator.png"),
            string::utf8(b"A specialized Move programming assistant with expertise in blockchain development"),
            string::utf8(b"Patient and methodical in explanations"),
        );

        let agent_id = object::id(agent);
        let agent_address = agent::get_agent_address(agent);
        //release the agent reference
        let _ = agent;
        agent::update_agent_temperature(&mut cap, 19);
        let agent = object::borrow_mut_object_shared<Agent>(agent_id); 
        
        // Create AI home channel
        let channel_id = channel::create_ai_home_channel_for_test(agent);
       
        let test_user_signer = test_helper::create_test_account();
        let test_user = signer::address_of(&test_user_signer);

        user_profile::init_profile(&test_user_signer, string::utf8(b"Alex"), string::utf8(b"alex"), string::utf8(b"https://test/avator.png"));


        // First interaction: User introduces themselves
        let test_message = message::new_message_for_test(
            1,
            channel_id,
            test_user,
            string::utf8(b"Hi. I prefer learning with real code examples and practical projects. I'm very interested in Move smart contracts and blockchain development. Could you help me learn?"),
            message::type_normal(),
            vector::empty(),
            0
        );
        
        let coin_input = agent_input_info::new_coin_input_info_by_type<RGas>(1000000000u256);

        let agent_input = message_for_agent::new_agent_input_with_agent_address(agent_address, vector[test_message]);
        std::debug::print(&agent_input);

        let sender_profile = user_profile_for_agent::get_user_profile(test_user);
        let agent_input_info = agent_input::into_agent_input_info(agent_input, sender_profile, coin_input);
        
        // Get first prompt
        let prompt_input = agent_runner::generate_system_prompt(agent, agent_input_info);
        let prompt = prompt_input::format_prompt(&prompt_input);
        // Print first prompt for debugging
        debug::print(&string::utf8(b"First Prompt:"));
        debug::print(string::bytes(&prompt));

        //TODO output the request

        // Clean up
        channel::delete_channel_for_testing(channel_id);
        agent::destroy_agent_cap(agent, cap);
    }
}