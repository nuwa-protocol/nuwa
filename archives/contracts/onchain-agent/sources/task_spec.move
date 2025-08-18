module nuwa_framework::task_spec{
    use std::vector;
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use moveos_std::json;
    use moveos_std::decimal_value::{Self, DecimalValue};
    use moveos_std::string_utils;
    use nuwa_framework::format_utils::{build_json_section};

    const MAX_TASK_SPECIFICATIONS: u64 = 5;
    const TASK_NAME_PREFIX: vector<u8> = b"task::";

    const ErrorInvalidTaskSpecifications: u64 = 1;

    #[data_struct]
    struct TaskSpecifications has copy, drop, store {
        task_specs: vector<TaskSpecification>,
    }

    #[data_struct]
    struct TaskSpecification has copy, drop, store {
        name: String,
        description: String,
        arguments: vector<TaskArgument>,
        resolver: address,
        on_chain: bool,
        price: DecimalValue,
    }

    #[data_struct]
    struct TaskArgument has copy, drop, store {
        name: String,
        type_desc: String,
        description: String,
        required: bool,
    }

    public fun empty_task_specifications(): TaskSpecifications {
        TaskSpecifications {
            task_specs: vector[],
        }
    }

    public fun new_task_specifications(task_specs: vector<TaskSpecification>): TaskSpecifications {
        TaskSpecifications {
            task_specs,
        }
    }

    public fun merge_task_specifications(first: &mut TaskSpecifications, second: TaskSpecifications) {
        vector::append(&mut first.task_specs, second.task_specs);
    }

    public fun new_task_spec(name: String, description: String, arguments: vector<TaskArgument>, resolver: address, on_chain: bool, price: DecimalValue): TaskSpecification {
        TaskSpecification {
            name,
            description,
            arguments,
            resolver,
            on_chain,
            price,
        }
    }

    public fun new_task_argument(name: String, type_desc: String, description: String, required: bool): TaskArgument {
        TaskArgument {
            name,
            type_desc,
            description,
            required,
        }
    }

    public fun task_specs_from_json(json_str: String): TaskSpecifications {
        let json_str_bytes = string::into_bytes(json_str);
        let task_specs = json::from_json<TaskSpecifications>(json_str_bytes);
        task_specs
    }

    public fun task_specs_to_json(task_specs: &TaskSpecifications): String {
        let json_str_bytes = json::to_json(task_specs);
        string::utf8(json_str_bytes)
    }

    public fun validate_task_specifications(task_specs: &TaskSpecifications){
        assert!(is_validate_task_specifications(task_specs), ErrorInvalidTaskSpecifications);
    }

    public fun is_validate_task_specifications(task_specs: &TaskSpecifications): bool {
        let length = vector::length(&task_specs.task_specs);
        if (length > MAX_TASK_SPECIFICATIONS) {
            return false
        };
        let idx = 0;
        while (idx < length) {
            let task_spec = vector::borrow(&task_specs.task_specs, idx);
            if (!is_validate_task_name(&task_spec.name)) {
                return false
            };
            let arguments = task_spec.arguments;
            let arguments_length = vector::length(&arguments);
            let arguments_idx = 0;
            while (arguments_idx < arguments_length) {
                let argument = vector::borrow(&arguments, arguments_idx);
                if (!is_validate_task_argument_type_desc(&argument.type_desc)) {
                    return false
                };
                arguments_idx = arguments_idx + 1;
            };
            idx = idx + 1;
        };
        true
    }

    const TASK_ARGUMENT_TYPE_DESCS: vector<vector<u8>> = vector[
        b"string",
        b"number",
        b"boolean",
    ];

    public fun is_validate_task_argument_type_desc(type_desc: &String): bool {
        let length = string::length(type_desc);
        if (length == 0) {
            return false
        };
        let idx = 0;
        let length = vector::length(&TASK_ARGUMENT_TYPE_DESCS);
        while (idx < length) {
            let allowed_type_desc = vector::borrow(&TASK_ARGUMENT_TYPE_DESCS, idx);
            if (string::bytes(type_desc) == allowed_type_desc) {
                return true
            };
            idx = idx + 1;
        };
        false
    }

    /// validate task specification name
    /// The task specification name must be a valid function name
    public fun is_validate_task_name(name: &String): bool {
       
        let length = string::length(name);
        
        // Name cannot be empty
        if (length == 0) {
            return false
        };

        // Name must start with the prefix
        if (!string_utils::starts_with(name, &string::utf8(TASK_NAME_PREFIX))) {
            return false
        };

        let name_without_prefix = string::sub_string(name, 6, length);
        let name_bytes = string::bytes(&name_without_prefix);
        let length = vector::length(name_bytes);

        // First character must be a letter or underscore
        let first_char = *vector::borrow(name_bytes, 0);
        if (!is_letter(first_char) && first_char != 95) { // 95 is '_'
            return false
        };

        // Rest characters must be letters, numbers or underscore
        let i = 1;
        while (i < length) {
            let char = *vector::borrow(name_bytes, i);
            if (!is_letter(char) && !is_number(char) && char != 95) {
                return false
            };
            i = i + 1;
        };
        true
    }

    fun is_letter(char: u8): bool {
        // Check if char is a-z or A-Z
        (char >= 97 && char <= 122) || (char >= 65 && char <= 90)
    }

    fun is_number(char: u8): bool {
        // Check if char is 0-9
        char >= 48 && char <= 57
    }
    

    public fun get_task_spec_by_name(task_specs: &TaskSpecifications, name: String): Option<TaskSpecification> {
        let length = vector::length(&task_specs.task_specs);
        let idx = 0;
        while (idx < length) {
            let task_spec = vector::borrow(&task_specs.task_specs, idx);
            if (task_spec.name == name) {
                return option::some(*task_spec)
            };
            idx = idx + 1;
        };
        option::none()
    }

    public fun get_task_name(task_spec: &TaskSpecification): &String {
        &task_spec.name
    }

    public fun get_task_description(task_spec: &TaskSpecification): &String {
        &task_spec.description
    }

    public fun get_task_arguments(task_spec: &TaskSpecification): &vector<TaskArgument> {
        &task_spec.arguments
    }
    
    public fun get_task_resolver(task_spec: &TaskSpecification): address {
        task_spec.resolver
    }

    public fun is_task_on_chain(task_spec: &TaskSpecification): bool {
        task_spec.on_chain
    }

    public fun get_task_argument_name(task_argument: &TaskArgument): &String {
        &task_argument.name
    }

    public fun get_task_argument_type_desc(task_argument: &TaskArgument): &String {
        &task_argument.type_desc
    }

    public fun get_task_argument_description(task_argument: &TaskArgument): &String {
        &task_argument.description
    }

    public fun is_task_argument_required(task_argument: &TaskArgument): bool {
        task_argument.required
    }

    public fun get_task_price(task_spec: &TaskSpecification): DecimalValue {
        task_spec.price
    }

    public fun format_prompt(task_specs: &TaskSpecifications): String {
        if (vector::length(&task_specs.task_specs) == 0) {
            return string::utf8(b"")
        };
        let prompt = string::utf8(b"You can perform the following tasks, the task is a specific type of action, it will be executed async:\n");
        string::append(&mut prompt, string::utf8(b"You can call the task same as the action.\n"));
        string::append(&mut prompt, string::utf8(b"The task price is in the unit of RGas, the user needs to pay for the task.\n"));
        let task_spec_json = build_json_section(task_specs);
        string::append(&mut prompt, task_spec_json);
        prompt
    }
 
    public fun example_task_specs(resolver: address): TaskSpecifications {
        let task_spec = new_task_spec(
            string::utf8(b"task::hello"),
            string::utf8(b"The task description for the AI Agent"),
            vector[new_task_argument(string::utf8(b"address"), string::utf8(b"string"), string::utf8(b"The sender address"), true)],
            resolver,
            false,
            decimal_value::new(110000000,8),
        );
        let task_specs = TaskSpecifications {
            task_specs: vector[task_spec],
        };
        task_specs
    }

    #[test]
    fun test_task_specs_to_json() {
        let task_specs = example_task_specs(@0x1234567890abcdef);
        let task_spec = vector::borrow(&task_specs.task_specs, 0);
        //std::debug::print(&task_specs);
        let json_str = task_specs_to_json(&task_specs);
        //std::debug::print(&json_str);
        let task_specs2 = task_specs_from_json(json_str);
        let task_spec2 = vector::borrow(&task_specs2.task_specs, 0);
        //std::debug::print(&task_specs2);
        assert!(task_spec.name == task_spec2.name, 1);
        assert!(task_spec.description == task_spec2.description, 2);
        assert!(task_spec.arguments == task_spec2.arguments, 3);
        assert!(task_spec.resolver == task_spec2.resolver, 4);
        assert!(task_spec.on_chain == task_spec2.on_chain, 5);
        assert!(decimal_value::is_equal(&task_spec.price, &task_spec2.price), 6);
        validate_task_specifications(&task_specs);
    }
    
}