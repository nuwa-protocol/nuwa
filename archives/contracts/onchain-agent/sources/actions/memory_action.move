module nuwa_framework::memory_action {
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use std::vector;
    
    use moveos_std::object::Object;
    use moveos_std::json;
    use moveos_std::result::{ok, err_str, Result};

    use nuwa_framework::agent::{Self, Agent};
    use nuwa_framework::action::{Self, ActionGroup};
    use nuwa_framework::prompt_input::{Self, PromptInput};
    use nuwa_framework::memory_info;

    friend nuwa_framework::action_dispatcher;

    /// Memory action names using more intuitive namespacing


    const ACTION_NAME_ADD: vector<u8> = b"memory::add";
    public fun action_name_add(): String { string::utf8(ACTION_NAME_ADD) }

    const ACTION_NAME_UPDATE: vector<u8> = b"memory::update";
    public fun action_name_update(): String { string::utf8(ACTION_NAME_UPDATE) }

    const ACTION_NAME_REMOVE: vector<u8> = b"memory::remove";
    public fun action_name_remove(): String { string::utf8(ACTION_NAME_REMOVE) }

    const ACTION_NAME_COMPACT: vector<u8> = b"memory::compact";
    public fun action_name_compact(): String { string::utf8(ACTION_NAME_COMPACT) }
    
    
    // Add new memory::none action
    const ACTION_NAME_NONE: vector<u8> = b"memory::none";
    public fun action_name_none(): String { string::utf8(ACTION_NAME_NONE) }


    #[data_struct]
    /// Arguments for adding a memory
    struct AddMemoryArgs has copy, drop, store {
        addr: address,
        content: String,     // Memory content
    }

    public fun create_add_memory_args(
        addr: address,
        content: String,
    ): AddMemoryArgs {
        AddMemoryArgs {
            addr,
            content,
        }
    }

    #[data_struct]
    /// Arguments for updating a memory
    struct UpdateMemoryArgs has copy, drop, store {
        addr: address,
        index: u64,
        content: String,
    }

    #[data_struct]
    /// Arguments for removing a memory
    struct RemoveMemoryArgs has copy, drop, store {
        addr: address,
        index: u64,
    }

    #[data_struct]
    /// Arguments for compacting a memory
    struct CompactMemoryArgs has copy, drop, store {
        addr: address,
        content: String,
    }

    // Action examples - simplified examples for better AI understanding
    const REMEMBER_SELF_EXAMPLE: vector<u8> = b"{\"content\":\"I find that I connect well with users who share personal stories\"}";
    const REMEMBER_USER_EXAMPLE: vector<u8> = b"{\"content\":\"User prefers detailed technical explanations\"}";

    const ADD_MEMORY_EXAMPLE: vector<u8> = b"{\"addr\":\"rooch1a47ny79da3tthtnclcdny4xtadhaxcmqlnpfthf3hqvztkphcqssqd8edv\",\"content\":\"User prefers using Chinese\"}";

    const UPDATE_MEMORY_EXAMPLE: vector<u8> = b"{\"addr\":\"rooch1a47ny79da3tthtnclcdny4xtadhaxcmqlnpfthf3hqvztkphcqssqd8edv\",\"index\":0,\"content\":\"User prefers using English\"}";

    const REMOVE_MEMORY_EXAMPLE: vector<u8> = b"{\"addr\":\"rooch1a47ny79da3tthtnclcdny4xtadhaxcmqlnpfthf3hqvztkphcqssqd8edv\",\"index\":0}";

    const COMPACT_MEMORY_EXAMPLE: vector<u8> = b"{\"addr\":\"rooch1a47ny79da3tthtnclcdny4xtadhaxcmqlnpfthf3hqvztkphcqssqd8edv\",\"content\":\"User prefers using English\"}";
    

    // Add example for memory::none action
    const NONE_EXAMPLE: vector<u8> = b"{\"reason\":null}";

    #[data_struct]
    /// Arguments for the memory::none action
    struct NoneArgs has copy, drop, store {
        reason: Option<String>,     // Optional reason for not creating memory
    }

    public fun create_none_args(
        reason: Option<String>
    ): NoneArgs {
        NoneArgs {
            reason
        }
    }

    public(friend) fun get_action_group(): ActionGroup {
        let description = string::utf8(b"Memory actions for storing and updating personal and user memories.\n");
        string::append(&mut description, string::utf8(b"You MUST use at least one memory action in EVERY interaction, use memory::none if there's nothing to remember or update.\n"));
        string::append(&mut description, string::utf8(b"If the memory is only about current sender, you should use the sender's address as the address parameter.\n"));
        string::append(&mut description, string::utf8(b"If the memory is about yourself or will be used for interact with others, you should use your own address as the address parameter.\n"));
        action::new_action_group(
            string::utf8(b"memory"),
            description,
            get_action_descriptions()
        )   
    }

    public(friend) fun get_action_descriptions(): vector<action::ActionDescription> {
        let descriptions = vector::empty();
        
        // First add the memory::none action with clear instruction about memory actions requirement
        let none_args = vector[
            action::new_action_argument(
                string::utf8(b"reason"),
                string::utf8(b"string"),
                string::utf8(b"Optional reason why no memory should be created, can be null"),
                false,
            ),
        ];

        vector::push_back(&mut descriptions, action::new_action_description(
            string::utf8(ACTION_NAME_NONE),
            string::utf8(b"Explicitly indicate that nothing should be remembered from this interaction"),
            none_args,
            string::utf8(NONE_EXAMPLE),
        ));

        let add_memory_args = vector[
            action::new_action_argument(
                string::utf8(b"addr"),
                string::utf8(b"address"),
                string::utf8(b"The address of you or the sender."),
                true,
            ),
            action::new_action_argument(
                string::utf8(b"content"),
                string::utf8(b"string"),
                string::utf8(b"The content of the memory"),
                true,
            ),
        ];

        vector::push_back(&mut descriptions, action::new_action_description(
            string::utf8(ACTION_NAME_ADD),
            string::utf8(b"Add a new memory, you can use this to record important information about you or the sender."),
            add_memory_args,
            string::utf8(ADD_MEMORY_EXAMPLE),
        ));

        let update_memory_args = vector[
            action::new_action_argument(
                string::utf8(b"addr"),
                string::utf8(b"address"),
                string::utf8(b"The address of you or the sender."),
                true,
            ),
            action::new_action_argument(
                string::utf8(b"index"),
                string::utf8(b"u64"),
                string::utf8(b"The index of the memory to update"),
                true,
            ),
            action::new_action_argument(
                string::utf8(b"content"),
                string::utf8(b"string"),
                string::utf8(b"The new content of the memory"),
                true,
            ),
        ];

        vector::push_back(&mut descriptions, action::new_action_description(
            string::utf8(ACTION_NAME_UPDATE),
            string::utf8(b"Update a existing memory"),
            update_memory_args,
            string::utf8(UPDATE_MEMORY_EXAMPLE),
        ));

        let remove_memory_args = vector[
            action::new_action_argument(
                string::utf8(b"addr"),
                string::utf8(b"address"),
                string::utf8(b"The address of you or the sender."),
                true,
            ),
            action::new_action_argument(
                string::utf8(b"index"),
                string::utf8(b"u64"),
                string::utf8(b"The index of the memory to remove"),
                true,
            ),
        ];

        vector::push_back(&mut descriptions, action::new_action_description(
            string::utf8(ACTION_NAME_REMOVE),
            string::utf8(b"Remove a memory"),
            remove_memory_args,
            string::utf8(REMOVE_MEMORY_EXAMPLE),
        ));

        let compact_memory_args = vector[
            action::new_action_argument(
                string::utf8(b"addr"),
                string::utf8(b"address"),
                string::utf8(b"The address of you or the sender."),
                true,
            ),
            action::new_action_argument(
                string::utf8(b"content"),
                string::utf8(b"string"),
                string::utf8(b"The content of the memory after compacting"),
                true,
            ),
        ];

        vector::push_back(&mut descriptions, action::new_action_description(
            string::utf8(ACTION_NAME_COMPACT),
            string::utf8(b"Compact all memories to a single memory, you can use this to summarize all memories, remove redundant memories."),
            compact_memory_args,
            string::utf8(COMPACT_MEMORY_EXAMPLE),
        ));
    
        descriptions
    }

    /// Execute memory actions
    public(friend) fun execute_internal(agent: &mut Object<Agent>, prompt: &PromptInput, action_name: String, args_json: String) :Result<bool, String> {
        
        if (action_name == string::utf8(ACTION_NAME_NONE)) {
            ok(false)
        }
        else if (action_name == string::utf8(ACTION_NAME_ADD)) {
            let args_opt = json::from_json_option<AddMemoryArgs>(string::into_bytes(args_json));
            if (!option::is_some(&args_opt)) {
                return err_str(b"Invalid arguments for add action")
            };
            let args = option::destroy_some(args_opt);
            agent::add_memory(agent, args.addr, args.content);
            ok(true)
        } else if (action_name == string::utf8(ACTION_NAME_UPDATE)) {
            let args_opt = json::from_json_option<UpdateMemoryArgs>(string::into_bytes(args_json));
            if (!option::is_some(&args_opt)) {
                return err_str(b"Invalid arguments for update action")
            };
            let args = option::destroy_some(args_opt);
            agent::update_memory(agent, args.addr, args.index, args.content);
            ok(true)
        } else if (action_name == string::utf8(ACTION_NAME_REMOVE)) {
            let args_opt = json::from_json_option<RemoveMemoryArgs>(string::into_bytes(args_json));
            if (!option::is_some(&args_opt)) {
                return err_str(b"Invalid arguments for remove action")
            };
            let args = option::destroy_some(args_opt);
            agent::remove_memory(agent, args.addr, args.index);
            ok(true)
        }else if (action_name == string::utf8(ACTION_NAME_COMPACT)) {
            let args_opt = json::from_json_option<CompactMemoryArgs>(string::into_bytes(args_json));
            if (!option::is_some(&args_opt)) {
                return err_str(b"Invalid arguments for compact action")
            };
            let args = option::destroy_some(args_opt);
            let memory_info = prompt_input::get_memory_info(prompt);
            if (memory_info::contains_memories(memory_info, &args.addr)){
                let original_memories = *memory_info::get_memories(memory_info, &args.addr);
                agent::compact_memory(agent, args.addr, original_memories, args.content);
                ok(true)
            }else{
                err_str(b"Invalid compact memory address arg")
            }
        }else {
            err_str(b"Unsupported action")
        }
    }
    

    #[test_only]
    struct TestInput has copy, drop, store{

    }

    #[test]
    fun test_memory_actions() {
        use nuwa_framework::agent;
        use nuwa_framework::agent_input_info;
        use moveos_std::object;
        use moveos_std::result;
        
        nuwa_framework::genesis::init_for_test();
        
        let (agent_obj, cap) = agent::create_default_test_agent();
        let _agent_address = agent::get_agent_address(agent_obj);
        let test_addr = @0x42;

        let response_channel_id = object::derive_object_id_for_test();
    
        let agent_input_info = agent_input_info::new_agent_input_info_for_test(
            test_addr,
            response_channel_id,
            string::utf8(b"Test input"),
            TestInput{},
            1000000000000000000u256
        );

        let agent_info = agent::get_agent_info(agent_obj);
        let prompt_input = prompt_input::new_prompt_input_for_test(agent_info, agent_input_info);

        // Test memory::add action
        let add_memory_args = AddMemoryArgs{
            addr: test_addr,
            content: string::utf8(b"User likes detailed explanations"),
        };
        let add_memory_json = string::utf8(json::to_json(&add_memory_args));
        let result = execute_internal(agent_obj, &prompt_input, string::utf8(ACTION_NAME_ADD), add_memory_json);
        assert!(result::is_ok(&result), 1);

        // Test memory::update action
        let update_memory_args = UpdateMemoryArgs{
            addr: test_addr,
            index: 0,
            content: string::utf8(b"User prefers detailed explanations"),
        };
        let update_memory_json = string::utf8(json::to_json(&update_memory_args));
        let result = execute_internal(agent_obj, &prompt_input, string::utf8(ACTION_NAME_UPDATE), update_memory_json);
        assert!(result::is_ok(&result), 2);

        // Test memory::remove action
        let remove_memory_args = RemoveMemoryArgs{
            addr: test_addr,
            index: 0,
        };
        let remove_memory_json = string::utf8(json::to_json(&remove_memory_args));
        let result = execute_internal(agent_obj, &prompt_input, string::utf8(ACTION_NAME_REMOVE), remove_memory_json);
        assert!(result::is_ok(&result), 3);

        // Test memory::compact action
        let compact_memory_args = CompactMemoryArgs{
            addr: test_addr,
            content: string::utf8(b"User prefers detailed explanations"),
        };
        let compact_memory_json = string::utf8(json::to_json(&compact_memory_args));
        let result = execute_internal(agent_obj, &prompt_input, string::utf8(ACTION_NAME_COMPACT), compact_memory_json);
        assert!(result::is_ok(&result), 4);

        // Test memory::none action
        let none_memory_json = string::utf8(b"{\"reason\":null}");
        let result = execute_internal(agent_obj, &prompt_input, string::utf8(ACTION_NAME_NONE), none_memory_json);
        assert!(result::is_ok(&result), 5);
        
        agent::destroy_agent_cap(agent_obj, cap);
    }

    #[test]
    fun test_memory_action_examples() {
        // Test add memory example
        let add_args = json::from_json<AddMemoryArgs>(ADD_MEMORY_EXAMPLE);
        assert!(add_args.addr == @0xed7d3278adec56bbae78fe1b3254cbeb6fd36360fcc295dd31b81825d837c021, 1);
        assert!(add_args.content == string::utf8(b"User prefers using Chinese"), 2);

        // Test update memory example
        let update_args = json::from_json<UpdateMemoryArgs>(UPDATE_MEMORY_EXAMPLE);
        assert!(update_args.addr == @0xed7d3278adec56bbae78fe1b3254cbeb6fd36360fcc295dd31b81825d837c021, 3);
        assert!(update_args.index == 0, 4);
        assert!(update_args.content == string::utf8(b"User prefers using English"), 5);

        // Test remove memory example
        let remove_args = json::from_json<RemoveMemoryArgs>(REMOVE_MEMORY_EXAMPLE);
        assert!(remove_args.addr == @0xed7d3278adec56bbae78fe1b3254cbeb6fd36360fcc295dd31b81825d837c021, 6);
        assert!(remove_args.index == 0, 7);

        // Test compact memory example
        let compact_args = json::from_json<CompactMemoryArgs>(COMPACT_MEMORY_EXAMPLE);
        assert!(compact_args.addr == @0xed7d3278adec56bbae78fe1b3254cbeb6fd36360fcc295dd31b81825d837c021, 8);
        assert!(compact_args.content == string::utf8(b"User prefers using English"), 9);

        // Test none memory example
        let none_args = json::from_json<NoneArgs>(NONE_EXAMPLE);
        assert!(option::is_none(&none_args.reason), 10);
    }

    // Add a new test for the memory::none action
    #[test]
    fun test_memory_none_action() {
        let none_args = json::from_json<NoneArgs>(NONE_EXAMPLE);
        assert!(option::is_none(&none_args.reason), 1);
    }
}