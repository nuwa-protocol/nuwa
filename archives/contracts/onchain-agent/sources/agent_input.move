module nuwa_framework::agent_input{
    use std::string::{Self, String};
    use moveos_std::json;
    use moveos_std::type_info;
    use moveos_std::object::{ObjectID};
    use nuwa_framework::agent_input_info::{Self, AgentInputInfo, CoinInputInfo};
    use nuwa_framework::task_spec::{TaskSpecifications};
    use nuwa_framework::user_profile_for_agent::{UserProfile};

    struct AgentInput<I> has copy, drop, store {
        sender: address,
        response_channel_id: ObjectID,
        input_description: String,
        input_data: I,
        app_task_specs: TaskSpecifications,
    } 

    public fun new_agent_input<I>(
        sender: address,
        response_channel_id: ObjectID,
        input_description: String,
        input_data: I,
        app_task_specs: TaskSpecifications,
    ): AgentInput<I> {
        AgentInput {
            sender,
            response_channel_id,
            input_description,
            input_data,
            app_task_specs,
        }
    } 

    public fun get_sender<I>(input: &AgentInput<I>): address {
        input.sender
    }

    public fun get_response_channel_id<I>(input: &AgentInput<I>): ObjectID {
        input.response_channel_id
    }

    public fun get_input_description<I>(input: &AgentInput<I>): &String {
        &input.input_description
    }

    public fun get_input_data<I>(input: &AgentInput<I>): &I {
        &input.input_data
    }

    public fun get_app_task_specs<I>(input: &AgentInput<I>): &TaskSpecifications {
        &input.app_task_specs
    }

    public fun unpack<I>(input: AgentInput<I>) : (address, ObjectID, String, I, TaskSpecifications) {
        let AgentInput { sender, response_channel_id, input_description, input_data, app_task_specs } = input;
        (sender, response_channel_id, input_description, input_data, app_task_specs)
    }

    public fun into_agent_input_info<I: drop>(input: AgentInput<I>, sender_profile: UserProfile, coin_input_info: CoinInputInfo) : AgentInputInfo {
        agent_input_info::new(
            input.sender,
            sender_profile,
            input.response_channel_id,
            coin_input_info,
            input.input_description,
            type_info::type_name<I>(),
            string::utf8(json::to_json(&input.input_data)),
            input.app_task_specs,
        )
    }
}