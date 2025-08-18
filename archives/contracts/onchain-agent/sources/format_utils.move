module nuwa_framework::format_utils {
    use std::string::{Self, String};
    use moveos_std::json;
    
    // Helper function to format JSON sections
    public fun build_json_section<D>(data: &D): String {
        let json_str = string::utf8(json::to_json(data));
        // Add proper indentation and line breaks for better readability
        let formatted = string::utf8(b"```json\n");
        string::append(&mut formatted, json_str);
        string::append(&mut formatted, string::utf8(b"\n```\n"));
        formatted
    }
}
