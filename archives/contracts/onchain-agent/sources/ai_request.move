module nuwa_framework::ai_request {
    use std::string::{Self, String};
    use moveos_std::json;
    use moveos_std::decimal_value::{DecimalValue};
    
    #[data_struct]
    struct ChatMessage has store, copy, drop {
        role: String,
        content: String,
    }

    #[data_struct]
    struct ChatRequest has store, copy, drop {
        model: String,
        messages: vector<ChatMessage>,
        temperature: DecimalValue,
    }

    public fun new_chat_request(model: String, messages: vector<ChatMessage>, temperature: DecimalValue): ChatRequest {
        ChatRequest {
            model,
            messages,
            temperature,
        }
    }

    public fun new_chat_message(role: String, content: String): ChatMessage {
        ChatMessage {
            role,
            content,
        }
    }

    public fun new_system_chat_message(content: String): ChatMessage {
        new_chat_message(string::utf8(b"system"), content)
    }

    public fun new_user_chat_message(content: String): ChatMessage {
        new_chat_message(string::utf8(b"user"), content)
    }

    public fun new_assistant_chat_message(content: String): ChatMessage {
        new_chat_message(string::utf8(b"assistant"), content)
    }

    public fun to_json(request: &ChatRequest): vector<u8> {
        json::to_json(request)
    }

}