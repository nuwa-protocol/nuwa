module nuwa_framework::response_action {
    use std::string::{Self, String};
    use std::option;
    use std::vector;
    use moveos_std::object::{Self, Object, ObjectID};
    use moveos_std::json;
    use moveos_std::result::{ok,err_str, Result};
    use nuwa_framework::agent::{Self, Agent};
    use nuwa_framework::action;
    use nuwa_framework::channel;
    use nuwa_framework::action::{ActionDescription, ActionGroup};
    use nuwa_framework::agent_input_info::{Self, AgentInputInfo};
    use nuwa_framework::message_for_agent;
    use nuwa_framework::prompt_input::{Self, PromptInput};
    
    friend nuwa_framework::action_dispatcher;
    friend nuwa_framework::task_action;

    const ACTION_NAME_SAY: vector<u8> = b"response::say";
    public fun action_name_say(): String {
        string::utf8(ACTION_NAME_SAY)
    }

    const SAY_EXAMPLE: vector<u8> = b"{\"content\":\"Hello\"}";

    #[data_struct]
    /// Arguments for the say action, respond to the current message
    struct SayActionArgs has copy, drop, store {
        content: String, 
    }

    public fun create_say_args(
        content: String
    ): SayActionArgs {
       SayActionArgs {
        content
       }
    }


    public(friend) fun get_action_group(): ActionGroup {
        let description = string::utf8(b"Actions related to responding to user.\n\n");

        action::new_action_group(
            string::utf8(b"response"),            
            description,
            get_action_descriptions()
        )   
    }

    /// Get descriptions for all response actions
    public(friend) fun get_action_descriptions() : vector<ActionDescription> {
        let descriptions = vector::empty();

        let say_args = vector[
            action::new_action_argument(
                string::utf8(b"content"),
                string::utf8(b"string"),
                string::utf8(b"The message content, you should use the language of the sender"),
                true,
            ),
        ];

        vector::push_back(&mut descriptions,
            action::new_action_description(
                string::utf8(ACTION_NAME_SAY),
                string::utf8(b"Use this action to reply to the current message, this message will be visible to everyone in the channel"),
                say_args,
                string::utf8(SAY_EXAMPLE),
        ));
 
        descriptions
    }

    /// Execute a response action
    public(friend) fun execute_internal(agent: &mut Object<Agent>, prompt: &PromptInput, action_name: String, args_json: String) : Result<bool, String> {
        if (action_name == string::utf8(ACTION_NAME_SAY)) {
            // Handle channel message action
            let args_opt = json::from_json_option<SayActionArgs>(string::into_bytes(args_json));
            if (option::is_none(&args_opt)) {
                return err_str(b"Invalid arguments for channel message action")
            };
            let args = option::destroy_some(args_opt);
            let agent_input = prompt_input::get_input_info(prompt);
            reply_to_current_message(agent, agent_input, args.content);
            ok(true)
        } else {
            err_str(b"Unsupported action")
        }
    }

    public(friend) fun reply_to_current_message(agent: &mut Object<Agent>, agent_input: &AgentInputInfo, content: String) {
        let channel_id = agent_input_info::get_response_channel_id(agent_input);
        let channel = object::borrow_mut_object_shared<channel::Channel>(channel_id);
        let agent_addr = agent::get_agent_address(agent);
        let input_data_type = agent_input_info::get_input_data_type(agent_input);
        let input_data_json = agent_input_info::get_input_data_json(agent_input);
        let input_data_option = message_for_agent::decode_agent_input_with_type(*input_data_type, *input_data_json);
        let reply_to = if (option::is_some(&input_data_option)) {
            let input_data = option::destroy_some(input_data_option);
            let current_message = message_for_agent::get_current(&input_data);
            message_for_agent::get_index(current_message)
        } else {
            0
        };
        channel::add_ai_response(channel, content, agent_addr, reply_to);
    }

    public(friend) fun send_event_to_channel(agent: &mut Object<Agent>, channel_id: ObjectID, event: String) {
        let channel = object::borrow_mut_object_shared<channel::Channel>(channel_id);
        let agent_addr = agent::get_agent_address(agent);
        channel::add_ai_event(channel, event, agent_addr);
    }

    #[test]
    fun test_response_action_examples() {
        // Test channel message example
        let channel_args = json::from_json<SayActionArgs>(SAY_EXAMPLE);
        assert!(channel_args.content == string::utf8(b"Hello"), 1);
    }
 
}