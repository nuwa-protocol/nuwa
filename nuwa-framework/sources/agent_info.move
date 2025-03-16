module nuwa_framework::agent_info {
    use std::string::{Self, String};
    use std::vector;
    use moveos_std::json;
    use moveos_std::object::{ObjectID};

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

    /// The PromptAgentInfo struct is used to display agent information in a prompt
    struct PromptAgentInfo has copy, drop, store {
        name: String,            
        username: String,
        agent_address: address,  // AI's agent address
        description: String,
        instructions: String,
    }

    public fun to_prompt(agent_info: &AgentInfo): String {
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
}