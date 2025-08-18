module nuwa_framework::user_joined_channels {
    use moveos_std::object::{Self, Object, ObjectID};

    friend nuwa_framework::channel;

    struct UserChannelStore has key {
    }

    struct JoinedChannel has store, copy, drop {
        channel_id: ObjectID,
        agent_id: ObjectID,
        joined_at: u64,
        active_at: u64,
    }

    fun borrow_mut_user_channel_store(user_address: address): &mut Object<UserChannelStore> {
        let user_channel_store_object_id = object::account_named_object_id<UserChannelStore>(user_address);
        if (!object::exists_object(user_channel_store_object_id)) {
            let user_channel_store_obj = object::new_account_named_object(user_address, UserChannelStore{
            });
            object::transfer_extend(user_channel_store_obj, user_address);
        };
        object::borrow_mut_object_extend<UserChannelStore>(user_channel_store_object_id)
    }

    public(friend) fun join_channel(user_address: address, channel_id: ObjectID, agent_id: ObjectID, now: u64){
        let user_channel_store_obj = borrow_mut_user_channel_store(user_address);
        object::add_field(user_channel_store_obj, channel_id, JoinedChannel{
            channel_id,
            agent_id,
            joined_at: now,
            active_at: now,
        });
    }

    public(friend) fun leave_channel(user_address: address, channel_id: ObjectID){
        let user_channel_store_obj = borrow_mut_user_channel_store(user_address);
        if (!object::contains_field(user_channel_store_obj, channel_id)) {
            return
        };
        let JoinedChannel{channel_id: _, agent_id: _, joined_at: _, active_at: _} = object::remove_field(user_channel_store_obj, channel_id);
    }

    public(friend) fun active_in_channel(user_address: address, channel_id: ObjectID, now: u64){
        let user_channel_store_obj = borrow_mut_user_channel_store(user_address);
        if (!object::contains_field(user_channel_store_obj, channel_id)) {
            return
        };
        let joined_channel: &mut JoinedChannel = object::borrow_mut_field(user_channel_store_obj, channel_id);
        joined_channel.active_at = now;
    }

    public fun get_joined_channel_count(user_address: address): u64 {
        let user_channel_object_id = object::account_named_object_id<UserChannelStore>(user_address);
        let user_channel_store_obj = object::borrow_object<UserChannelStore>(user_channel_object_id);
        object::field_size(user_channel_store_obj)
    }

    public fun borrow_joined_channel(user_address: address, channel_id: ObjectID): &JoinedChannel {
        let user_channel_object_id = object::account_named_object_id<UserChannelStore>(user_address);
        let user_channel_store_obj = object::borrow_object<UserChannelStore>(user_channel_object_id);
        object::borrow_field(user_channel_store_obj, channel_id)
    }


    #[test_only]
    use moveos_std::timestamp;

    #[test]
    fun test_join_and_leave_channel() {

        // Mock channel and agent IDs
        let channel_id = object::derive_object_id_for_test();
        let agent_id = object::derive_object_id_for_test();
        let test_addr = @0x42;
        let now = timestamp::now_milliseconds();
        // Test joining channel
        join_channel(test_addr, channel_id, agent_id, now);
        let joined_channels = get_joined_channel_count(test_addr);
        assert!(joined_channels == 1, 1);

        // Test leaving channel
        leave_channel(test_addr, channel_id);
        joined_channels = get_joined_channel_count(test_addr);
        assert!(joined_channels == 0, 4);
    }

    #[test]
    fun test_active_in_channel() {

        // Mock channel and agent IDs
        let channel_id = object::derive_object_id_for_test();
        let agent_id = object::derive_object_id_for_test();
        let test_addr = @0x42;
        let now = timestamp::now_milliseconds();
        // Join channel
        join_channel(test_addr, channel_id, agent_id, now);
        let joined_channel = borrow_joined_channel(test_addr, channel_id);
        let initial_active_at = joined_channel.active_at;
        // Test active in channel
        timestamp::fast_forward_milliseconds_for_test(1000);
        let now = timestamp::now_milliseconds();
        active_in_channel(test_addr, channel_id, now);
        let updated_active_at = joined_channel.active_at;
        assert!(updated_active_at > initial_active_at, 1);
    }

    #[test]
    fun test_leave_nonexistent_channel() {
        // Mock channel and agent IDs
        let channel_id = object::derive_object_id_for_test();
        let test_addr = @0x42;

        // Try to leave a channel that hasn't been joined
        leave_channel(test_addr, channel_id);
        let joined_channels = get_joined_channel_count(test_addr);
        assert!(joined_channels == 0, 1);
    }

    #[test]
    fun test_active_in_nonexistent_channel() {
        // Mock channel and agent IDs
        let channel_id = object::derive_object_id_for_test();
        let test_addr = @0x42;
        let now = timestamp::now_milliseconds();
        // Try to mark activity in a channel that hasn't been joined
        active_in_channel(test_addr, channel_id, now);
        let joined_channels = get_joined_channel_count(test_addr);
        assert!(joined_channels == 0, 1);
    }
}