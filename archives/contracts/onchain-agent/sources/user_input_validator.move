module nuwa_framework::user_input_validator {
    use std::string::{Self, String};
    use std::vector;
    use nuwa_framework::config;

    // Username related error codes
    const ErrorUsernameTooShort: u64 = 4;
    const ErrorUsernameTooLong: u64 = 5;
    const ErrorUsernameInvalidChar: u64 = 6;
    const ErrorUsernameEmpty: u64 = 7;
    const ErrorUsernameOnlyNumbers: u64 = 8;

    // Common text validation error codes
    const ErrorTextEmpty: u64 = 9;
    const ErrorTextTooLong: u64 = 10;
    const ErrorTextContainsControlChar: u64 = 11;
    const ErrorTextOnlyWhitespace: u64 = 12;
    const ErrorTextContainsNewline: u64 = 13;
    const ErrorTextTooShort: u64 = 14;

    /// Internal function to check if a username meets all requirements
    public fun validate_username(username: &String) {
        let bytes = string::bytes(username);
        let length = vector::length(bytes);
        
        let min_length = config::get_min_username_length();
        let max_length = config::get_max_username_length();
        
        // Check if username is empty
        assert!(length > 0, ErrorUsernameEmpty);
        
        // Check length constraints
        assert!(length >= min_length, ErrorUsernameTooShort);
        assert!(length <= max_length, ErrorUsernameTooLong);
        
        // Check for valid characters and non-number requirement
        let has_non_number = false;
        let i = 0;
        while (i < length) {
            let char_byte = *vector::borrow(bytes, i);
            let is_lowercase_letter = char_byte >= 97 && char_byte <= 122; // a-z
            let is_uppercase_letter = char_byte >= 65 && char_byte <= 90;  // A-Z
            let is_digit = char_byte >= 48 && char_byte <= 57;            // 0-9
            let is_underscore = char_byte == 95;                          // _
            
            if (is_lowercase_letter || is_uppercase_letter || is_underscore) {
                has_non_number = true;
            };
            
            // Validate character is allowed
            assert!(is_lowercase_letter || is_uppercase_letter || is_digit || is_underscore, 
                   ErrorUsernameInvalidChar);
            
            i = i + 1;
        };
        
        // Ensure username isn't only numbers
        assert!(has_non_number, ErrorUsernameOnlyNumbers);
    }

    /// Internal function to validate text content with configurable rules
    fun validate_text_content(
        text: &String, 
        max_length: u64,
        allow_empty: bool,
        allow_newline: bool,
        min_length: u64,
    ) {
        let bytes = string::bytes(text);
        let length = vector::length(bytes);
        
        // Check if text is empty
        if (!allow_empty) {
            assert!(length > 0, ErrorTextEmpty);
            // Check minimum length only if text is not allowed to be empty
            assert!(length >= min_length, ErrorTextTooShort);
        };
        
        // Check length constraint
        assert!(length <= max_length, ErrorTextTooLong);
        
        // Check for control characters and ensure at least one non-whitespace character
        let has_non_whitespace = false;
        let i = 0;
        while (i < length) {
            let char_byte = *vector::borrow(bytes, i);
            
            // First check for newlines in non-newline text
            if (!allow_newline) {
                assert!(char_byte != 0x0A && char_byte != 0x0D, ErrorTextContainsNewline);
            };
            
            // Then check for other control characters
            if (!allow_newline) {
                // For non-newline allowed text, reject all control characters
                assert!(char_byte > 0x1F && char_byte != 0x7F, ErrorTextContainsControlChar);
            } else {
                // For newline allowed text, allow \n (0x0A) and \r (0x0D)
                assert!(
                    (char_byte > 0x1F && char_byte != 0x7F) || 
                    char_byte == 0x0A || 
                    char_byte == 0x0D, 
                    ErrorTextContainsControlChar
                );
            };
            
            // Check for non-whitespace characters
            if (char_byte != 0x20 && char_byte != 0x09 && char_byte != 0x0A && char_byte != 0x0D) {
                has_non_whitespace = true;
            };
            
            i = i + 1;
        };
        
        // If text is not empty, ensure it isn't only whitespace
        if (length > 0) {
            assert!(has_non_whitespace, ErrorTextOnlyWhitespace);
        };
    }

    /// Check if a display name meets all requirements
    /// Name cannot be empty, has minimum length, and cannot contain newlines
    public fun validate_name(name: &String) {
        validate_text_content(
            name,
            config::get_max_name_length(),
            false, // not allow empty
            false, // not allow newline
            config::get_min_name_length(),
        )
    }

    /// Check if a channel title meets all requirements
    /// Channel title cannot be empty and cannot contain newlines
    public fun validate_channel_title(title: &String) {
        validate_text_content(
            title,
            config::get_max_channel_title_length(),
            false, // not allow empty
            false, // not allow newline
            1, // minimum length 1
        )
    }

    /// Check if a channel message meets all requirements
    /// Message cannot be empty but can contain newlines
    public fun validate_channel_message(message: &String) {
        validate_text_content(
            message,
            config::get_max_channel_message_length(),
            false, // not allow empty
            true,  // allow newline
            1,     // minimum length 1
        )
    }

    /// Check if an agent description meets all requirements
    /// Description can be empty but cannot contain newlines
    public fun validate_agent_description(description: &String) {
        validate_text_content(
            description,
            config::get_max_agent_description_length(),
            true,  // allow empty
            false, // not allow newline
            0,     // no minimum length
        )
    }

    /// Check if agent instructions meet all requirements
    /// Instructions can be empty and can contain newlines
    public fun validate_agent_instructions(instructions: &String) {
        validate_text_content(
            instructions,
            config::get_max_agent_instructions_length(),
            true,  // allow empty
            true,  // allow newline
            0,     // no minimum length
        )
    }

    #[test]
    fun test_validate_text_content_success() {
        use std::string;
        
        // Test name validation (non-empty, no newlines)
        validate_name(&string::utf8(b"Alice"));
        validate_name(&string::utf8(b"Bob 123"));
        validate_name(&string::utf8(b"John Smith"));
        
        // Test channel message (non-empty, with newlines)
        validate_channel_message(&string::utf8(b"Hello\nWorld"));
        validate_channel_message(&string::utf8(b"Line 1\r\nLine 2"));
        
        // Test description (can be empty, no newlines)
        validate_agent_description(&string::utf8(b""));
        validate_agent_description(&string::utf8(b"AI Assistant"));
        
        // Test instructions (can be empty, with newlines)
        validate_agent_instructions(&string::utf8(b""));
        validate_agent_instructions(&string::utf8(b"Step 1\nStep 2\nStep 3"));
    }

    #[test]
    #[expected_failure(abort_code = ErrorTextEmpty)]
    fun test_empty_name() {
        validate_name(&string::utf8(b""));
    }

    #[test]
    #[expected_failure(abort_code = ErrorTextContainsNewline)]
    fun test_name_with_newline() {
        validate_name(&string::utf8(b"Hello\nWorld"));
    }

    #[test]
    #[expected_failure(abort_code = ErrorTextTooShort)]
    fun test_name_too_short() {
        // Use a single character to test minimum length
        validate_name(&string::utf8(b"a"));
    }

    #[test]
    fun test_empty_description() {
        validate_agent_description(&string::utf8(b""));
    }

    #[test]
    #[expected_failure(abort_code = ErrorTextContainsNewline)]
    fun test_description_with_newline() {
        validate_agent_description(&string::utf8(b"Line 1\nLine 2"));
    }

    #[test]
    fun test_instructions_with_newline() {
        validate_agent_instructions(&string::utf8(b"Step 1\nStep 2"));
    }

    #[test]
    fun test_empty_instructions() {
        validate_agent_instructions(&string::utf8(b""));
    }

    #[test]
    #[expected_failure(abort_code = ErrorTextEmpty)]
    fun test_empty_message() {
        validate_channel_message(&string::utf8(b""));
    }

    #[test]
    fun test_message_with_newline() {
        validate_channel_message(&string::utf8(b"Hello\nWorld"));
    }
}