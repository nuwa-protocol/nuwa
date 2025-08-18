module nuwa_framework::agent_info {
    use std::string::{Self, String};
    use std::vector;
    use moveos_std::json;
    use moveos_std::object::{ObjectID};
    use moveos_std::decimal_value::{DecimalValue};

    #[data_struct]
    struct AgentInfo has copy, drop, store {
        id: ObjectID,
        agent_address: address,
        name: String,            
        username: String,
        avatar: String,        
        description: String,
        instructions: String,
        model_provider: String,
        temperature: DecimalValue,
        status: u8,
    }

    public fun new_agent_info(
        id: ObjectID,
        agent_address: address,
        name: String,
        username: String,
        avatar: String,
        description: String,
        instructions: String,
        model_provider: String,
        temperature: DecimalValue,
        status: u8,
    ): AgentInfo {
        AgentInfo {
            id,
            agent_address,
            name,
            username,
            avatar,
            description,
            instructions,
            model_provider,
            temperature,
            status,
        }
    }

    // ============ Getters ============
    public fun get_id(agent_info: &AgentInfo): ObjectID {
        agent_info.id
    }

    public fun get_name(agent_info: &AgentInfo): &String {
        &agent_info.name
    }

    public fun get_username(agent_info: &AgentInfo): &String {
        &agent_info.username
    }

    public fun get_avatar(agent_info: &AgentInfo): &String {
        &agent_info.avatar
    }

    public fun get_agent_address(agent_info: &AgentInfo): address {
        agent_info.agent_address
    }

    public fun get_description(agent_info: &AgentInfo): &String {
        &agent_info.description
    }

    public fun get_instructions(agent_info: &AgentInfo): &String {
        &agent_info.instructions
    }

    public fun get_model_provider(agent_info: &AgentInfo): &String {
        &agent_info.model_provider
    }

    public fun get_status(agent_info: &AgentInfo): u8 {
        agent_info.status
    }

    public fun get_temperature(agent_info: &AgentInfo): DecimalValue {
        agent_info.temperature
    }

    public fun set_instructions(agent_info: &mut AgentInfo, instructions: String) {
        agent_info.instructions = instructions;
    }

    /// The PromptAgentInfo struct is used to display agent information in a prompt
    struct PromptAgentInfo has copy, drop, store {
        name: String,            
        username: String,
        agent_address: address,  // AI's agent address
        description: String,
        instructions: String,
    }

    public fun format_prompt(agent_info: &AgentInfo): String {
        let prompt_agent_info = PromptAgentInfo {
            name: agent_info.name,
            username: agent_info.username,
            agent_address: agent_info.agent_address,
            description: agent_info.description,
            instructions: agent_info.instructions,
        };
        let prompt = b"```json\n";
        vector::append(&mut prompt, json::to_json(&prompt_agent_info));
        vector::append(&mut prompt, b"\n```");
        string::utf8(prompt)
    }

    #[test_only]
    public fun mock_agent_info(): AgentInfo {
        use moveos_std::tx_context;
        use moveos_std::object;
        use moveos_std::decimal_value;

        let obj_id = object::derive_object_id_for_test();
        let agent_address = tx_context::fresh_address();
        new_agent_info(
            obj_id,
            agent_address,
            string::utf8(b"Test Agent"),
            string::utf8(b"test_agent"),
            string::utf8(b"https://example.com/avatar.png"),
            string::utf8(b"Test Agent Description"),
            string::utf8(b"Test Agent Instructions"),
            string::utf8(b"gpt-4o"),
            decimal_value::new(7, 1),
            0,
        )
    }
}