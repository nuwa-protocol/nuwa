module nuwa_framework::ai_callback {
    use std::option;
    use std::string::{Self, String};

    use moveos_std::object::{Self, ObjectID};
    use moveos_std::string_utils;
    use moveos_std::json;
    use moveos_std::event;
    
    use verity::oracles;

    use nuwa_framework::agent::Agent;
    use nuwa_framework::ai_service;
    use nuwa_framework::ai_response;
    use nuwa_framework::action_dispatcher;
    use nuwa_framework::agent_runner;
    
    struct PendingRequestNotFoundEvent has copy, drop, store {
        request_id: ObjectID,
    }

    struct AIOracleResponseErrorEvent has copy, drop, store {
        request_id: ObjectID,
        error_message: String,
    }
 
    public entry fun process_response(request_id: ObjectID) {
        let pending_request = ai_service::take_pending_request(request_id);
        if(option::is_some(&pending_request)){
            let pending_request = option::destroy_some(pending_request);
            let (request_id, agent_id, prompt) = ai_service::unpack_pending_request(pending_request);
            let response_status = oracles::get_response_status(&request_id);
            if (response_status != 0) {
                let response = oracles::get_response(&request_id);
                let response_content = option::destroy_some(response);
                
                let error_message = if (response_status == 200) {
                    let json_str_opt = json::from_json_option<String>(string::into_bytes(response_content));
                    let json_str = if(option::is_some(&json_str_opt)){
                        option::destroy_some(json_str_opt)
                    }else{
                        response_content
                    };
                    let chat_completion_opt = ai_response::parse_chat_completion_option(json_str);
                    if(option::is_some(&chat_completion_opt)){
                        let chat_completion = option::destroy_some(chat_completion_opt);
                        let message_content = ai_response::get_message_content(&chat_completion);

                        let agent = object::borrow_mut_object_shared<Agent>(agent_id);
                        action_dispatcher::dispatch_actions_internal(agent, &prompt, message_content);
                        agent_runner::finish_request(agent, prompt, request_id);
                        let refusal = ai_response::get_refusal(&chat_completion);
                        if(option::is_some(&refusal)){
                            option::destroy_some(refusal)
                        }else{
                            string::utf8(b"")
                        }
                    }else{
                        response_content
                    }
                }else{
                    let error_message = string::utf8(b"AI Oracle response error, error code: ");
                    string::append(&mut error_message, string_utils::to_string_u32((response_status as u32)));
                    string::append(&mut error_message, string::utf8(b", response: "));
                    string::append(&mut error_message, response_content);
                    error_message
                };
                let event = AIOracleResponseErrorEvent {
                    request_id: request_id,
                    error_message,
                };
                event::emit(event);
            }; 
        }else{
            let event = PendingRequestNotFoundEvent {
                request_id: request_id,
            };
            event::emit(event);
        }
    }
}