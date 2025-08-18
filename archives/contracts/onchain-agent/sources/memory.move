module nuwa_framework::memory {
    use std::string::{String};
    use std::vector;
    use moveos_std::table::{Self, Table};
    use moveos_std::timestamp;
    use nuwa_framework::index_table::{Self, IndexTable};

    friend nuwa_framework::agent;

    const ErrorMemoryNotFound: u64 = 1;

    /// Constants for memory retrieval
    const MAX_CONTEXT_MEMORIES: u64 = 15;

    /// Single memory entry
    struct Memory has copy, store, drop {
        index: u64,
        content: String,
        timestamp: u64,
    }

    /// MemoryStore manages all memories for an agent
    struct MemoryStore has store {
        // Meta memories by user address (including agent's own memory)
        memories: Table<address, IndexTable<Memory>>,
    }
 
    public(friend) fun new_memory_store(): MemoryStore {
        let store = MemoryStore {
            memories: table::new(),
        };
        store
    }

    /// Add a new memory for a specific user or agent itself
    public fun add_memory(
        store: &mut MemoryStore,
        user: address,
        content: String,
    ) {
        if (!table::contains(&store.memories, user)) {
            table::add(&mut store.memories, user, index_table::new());
        };

        let memories = table::borrow_mut(&mut store.memories, user);
        let index = index_table::get_index(memories);
        let memory = Memory {
            index,
            content,
            timestamp: timestamp::now_milliseconds(),
        };
        index_table::add(memories, memory);
    }

    /// Update an existing memory in either short-term or long-term memory
    public fun update_memory(
        store: &mut MemoryStore,
        user: address,
        index: u64,
        new_content: String,
    ) {
        if (!table::contains(&store.memories, user)) {
            table::add(&mut store.memories, user, index_table::new());
        };
        let memories = table::borrow_mut(&mut store.memories, user);

        let memory = Memory {
            index,
            content: new_content,
            timestamp: timestamp::now_milliseconds(),
        };
        index_table::upsert(memories, index, memory);
    }

    public fun remove_memory(store: &mut MemoryStore, user: address, index: u64) {
        if (!table::contains(&store.memories, user)) {
            return
        };
        let memories = table::borrow_mut(&mut store.memories, user);
        index_table::remove(memories, index);
    }

    public fun compact_memory(store: &mut MemoryStore, user: address, original_memory: vector<Memory>, compact_memory: String) {
        let memories = table::borrow_mut(&mut store.memories, user);
        vector::for_each(original_memory, |memory| {
            let memory: Memory = memory;
            index_table::remove(memories, memory.index);
        });
        add_memory(store, user, compact_memory);
    }

    /// Get all memories for a user (both short-term and long-term)
    public fun get_all_memories(
        store: &MemoryStore,
        user: address,
    ): vector<Memory> {
        let results = vector::empty<Memory>();
        if (!table::contains(&store.memories, user)) {
            return results
        };

        let memories = table::borrow(&store.memories, user);
        index_table::get_all(memories)
    }

    /// Get relevant memories for AI context
    public fun get_context_memories(
        store: &MemoryStore,
        user: address,
    ): vector<Memory> {
        let results = vector::empty<Memory>();
        if (!table::contains(&store.memories, user)) {
            return results
        };

        let memories = table::borrow(&store.memories, user);
        index_table::get_latest(memories, MAX_CONTEXT_MEMORIES)
    }

    /// Getter functions for Memory fields
    public fun get_content(memory: &Memory): String {
        memory.content
    }


    public fun get_timestamp(memory: &Memory): u64 {
        memory.timestamp
    }

    // Add getter for index
    public fun get_index(memory: &Memory): u64 {
        memory.index
    }

    #[test_only]
    public fun destroy_memory_store_for_test(store: MemoryStore) {
        let MemoryStore { memories } = store;
        table::drop_unchecked(memories);
    }
    
    #[test_only]
    /// Create a new memory store for testing
    public fun new_test_memory_store(): MemoryStore {
        new_memory_store()
    }

    #[test]
    fun test_memory_indices() {
        use std::string;
        let store = new_test_memory_store();
        let test_user = @0x42;

        // Add memories
        add_memory(&mut store, test_user, string::utf8(b"First"));
        add_memory(&mut store, test_user, string::utf8(b"Second"));
        add_memory(&mut store, test_user, string::utf8(b"Third"));

        // Verify indices
        let memories = get_all_memories(&store, test_user);
        assert!(get_index(vector::borrow(&memories, 0)) == 0, 1);
        assert!(get_index(vector::borrow(&memories, 1)) == 1, 2);
        assert!(get_index(vector::borrow(&memories, 2)) == 2, 3);

        let context_memories = get_context_memories(&store, test_user);
        std::debug::print(&context_memories);
        assert!(vector::length(&context_memories) == 3, 4);

        destroy_memory_store_for_test(store);
    }

    #[test]
    fun test_add_memory() {
        use std::string;
        let store = new_test_memory_store();
        let test_user = @0x42;
        add_memory(&mut store, test_user, string::utf8(b"First"));
        let memories = get_all_memories(&store, test_user);
        assert!(get_index(vector::borrow(&memories, 0)) == 0, 1);
        destroy_memory_store_for_test(store);
    }

    #[test]
    fun test_update_memory(){
        use std::string;
        let store = new_test_memory_store();
        let test_user = @0x42;
        add_memory(&mut store, test_user, string::utf8(b"First"));
        update_memory(&mut store, test_user, 0, string::utf8(b"Updated"));
        let memories = get_all_memories(&store, test_user);
        assert!(get_index(vector::borrow(&memories, 0)) == 0, 1);
        assert!(get_content(vector::borrow(&memories, 0)) == string::utf8(b"Updated"), 2);
        destroy_memory_store_for_test(store);
    }
    
    #[test]
    fun test_compact_memory(){
        use std::string;
        let store = new_test_memory_store();
        let test_user = @0x42;
        add_memory(&mut store, test_user, string::utf8(b"First"));
        add_memory(&mut store, test_user, string::utf8(b"Second"));
        let memories = get_all_memories(&store, test_user);
        std::debug::print(&memories);
        compact_memory(&mut store, test_user, memories, string::utf8(b"Compact"));
        let memories = get_all_memories(&store, test_user);
        let len = vector::length(&memories);
        assert!(len == 1, 1);
        let memory = vector::borrow(&memories, 0);
        std::debug::print(memory);
        assert!(get_index(memory) == 0, 2);
        assert!(get_content(memory) == string::utf8(b"Compact"), 3);
        destroy_memory_store_for_test(store);
    }
}