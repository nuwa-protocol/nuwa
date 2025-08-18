module nuwa_framework::memory_info {
    use std::string::{Self, String};
    use moveos_std::address;
    use moveos_std::simple_map::{Self, SimpleMap};
    use nuwa_framework::memory::{Memory};
    use nuwa_framework::format_utils::{build_json_section};
    
    struct MemoryInfo has copy, drop, store {
        simple_map: SimpleMap<address, vector<Memory>>,
    }
    
    public fun new(): MemoryInfo {
        MemoryInfo {
            simple_map: simple_map::new(),
        }
    }

    public fun add_memory(memory_info: &mut MemoryInfo, addr: address, memories: vector<Memory>) {
        simple_map::add(&mut memory_info.simple_map, addr, memories);
    }

    public fun get_memories(memory_info: &MemoryInfo, addr: &address): &vector<Memory> {
        simple_map::borrow(&memory_info.simple_map, addr)
    }

    public fun contains_memories(memory_info: &MemoryInfo, addr: &address) : bool {
        simple_map::contains_key(&memory_info.simple_map, addr)
    }

    public fun format_prompt(agent_address: address, sender: address, memory_info: &MemoryInfo): String {
        let result = string::utf8(b"Your Memories about yourself:\n");
        let self_memories = simple_map::borrow(&memory_info.simple_map, &agent_address);
        string::append(&mut result, build_json_section(self_memories));
        string::append(&mut result, string::utf8(b"Your Memories about the sender("));
        string::append(&mut result, address::to_bech32_string(sender));
        string::append(&mut result, string::utf8(b"):\n"));
        let user_memories = simple_map::borrow(&memory_info.simple_map, &sender);
        string::append(&mut result, build_json_section(user_memories));
        result
    }

    #[test_only]
    public fun mock_memory_info(agent_address: address, sender: address): MemoryInfo {
        use std::vector;
        let self_memories = vector::empty();
        let user_memories = vector::empty();
        let memory_info = new();
        add_memory(&mut memory_info, agent_address, self_memories);
        add_memory(&mut memory_info, sender, user_memories);
        memory_info
    }

}