module nuwa_framework::task_action {
    use std::string::{String};
    use std::option;
    use moveos_std::object::{Object};
    use moveos_std::result::{ok, err_str, Result};
    use nuwa_framework::task;
    use nuwa_framework::task_spec;
    use nuwa_framework::agent::{Self, Agent};
    use nuwa_framework::agent_input_info;
    use nuwa_framework::prompt_input::{Self, PromptInput};

    friend nuwa_framework::action_dispatcher;
    
    const TASK_ACTION_NAMESPACE: vector<u8> = b"task";
    
    public(friend) fun execute_internal(agent: &mut Object<Agent>, prompt: &PromptInput, action_name: String, args_json: String) :Result<bool, String> {
        let task_name = action_name;
        let agent_address = agent::get_agent_address(agent);
        let agent_input = prompt_input::get_input_info(prompt);
        let response_channel_id = agent_input_info::get_response_channel_id(agent_input);
        let task_spec = agent::get_agent_task_spec(agent, task_name);
        if (option::is_none(&task_spec)) {
            return err_str(b"Task not found")
        };
        let task_spec = option::destroy_some(task_spec);
        let resolver = task_spec::get_task_resolver(&task_spec);
        let on_chain = task_spec::is_task_on_chain(&task_spec);
        task::publish_task(agent_address, task_name, args_json, response_channel_id, resolver, on_chain);
        ok(true)
    }
}