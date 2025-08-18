#[test_only]
module nuwa_framework::channel_tests {
    use std::string::{Self, String};
    use std::signer;
    use std::vector;
    use moveos_std::timestamp;
    use moveos_std::object::{Self, ObjectID};
    use nuwa_framework::channel;
    use nuwa_framework::message;
    use nuwa_framework::agent;
    use nuwa_framework::channel_entry;
    use nuwa_framework::test_helper;

    #[test_only]
    fun create_ai_home_channel_for_test(): ObjectID {
        let (agent, cap) = agent::create_default_test_agent();
        object::to_shared(cap);
        timestamp::fast_forward_milliseconds_for_test(1000);

        let channel_id = channel::create_ai_home_channel_for_test(agent);
        channel_id
    }

    #[test_only]
    fun create_topic_channel_for_test(topic: String, join_policy: u8): ObjectID {
        let home_channel_id = create_ai_home_channel_for_test();
        let home_channel = object::borrow_mut_object_shared<channel::Channel>(home_channel_id);
        let user = test_helper::create_test_account();
        channel_entry::join_channel(&user, home_channel);
        channel::create_topic_channel(&user, home_channel, topic, join_policy)
    }

    #[test]
    fun test_create_ai_home_channel() {
        nuwa_framework::genesis::init_for_test();
        let channel_id = create_ai_home_channel_for_test();
        
        // Try joining as a user
        let user = test_helper::create_test_account();
        let channel = object::borrow_mut_object_shared(channel_id);
        channel::join_channel(&user, channel);
        
        // Verify user is now a member
        let channel = object::borrow_object(channel_id);
        assert!(channel::is_member(channel, signer::address_of(&user)), 1);

        channel::delete_channel_for_testing(channel_id);
    }


    #[test]
    fun test_message_sending() {
        nuwa_framework::genesis::init_for_test();
        let user = test_helper::create_test_account();
         
        // Create peer channel
        let channel_id = create_ai_home_channel_for_test();
        
        
        // Send message
        let channel = object::borrow_mut_object_shared(channel_id);
        channel_entry::join_channel(&user, channel);

        let msg_content = string::utf8(b"Hello AI!");
        let mentions = vector::empty();
        let (_, _) = channel::send_message_for_test(&user, channel, msg_content, mentions, 0);
        
        // Verify message
        let channel = object::borrow_object(channel_id);
        let message_ids = channel::get_messages(channel);
        assert!(vector::length(&message_ids) == 1, 0);
        
        let msg_id = vector::borrow(&message_ids, 0);
        let msg_obj = object::borrow_object<message::Message>(*msg_id);
        let msg = object::borrow(msg_obj);
        assert!(message::get_content(msg) == msg_content, 1);
        assert!(message::get_sender(msg) == signer::address_of(&user), 2);
        assert!(message::get_type(msg) == message::type_normal(), 3);

        channel::delete_channel_for_testing(channel_id);
    }

    #[test]
    fun test_public_join_policy_channel() {
        nuwa_framework::genesis::init_for_test();
        let user1 = test_helper::create_test_account();
        
        let channel_id = create_topic_channel_for_test(string::utf8(b"Test"), channel::channel_join_policy_public());
        
        // Try sending message from unauthorized user
        let channel = object::borrow_mut_object_shared(channel_id);
        
        let mentions = vector::empty();
        let (_, _) = channel::send_message_for_test(&user1, channel, string::utf8(b"Unauthorized message"), mentions, 0);

        channel::delete_channel_for_testing(channel_id);
    }

    #[test]
    #[expected_failure(abort_code = channel::ErrorNotMember)]
    fun test_invite_join_policy_channel() {
        nuwa_framework::genesis::init_for_test();
        let user1 = test_helper::create_test_account();
        
        let channel_id = create_topic_channel_for_test(string::utf8(b"Test"), channel::channel_join_policy_invite());
        
        // Try sending message from unauthorized user
        let channel = object::borrow_mut_object_shared(channel_id);
        
        let mentions = vector::empty();
        let (_, _) = channel::send_message_for_test(&user1, channel, string::utf8(b"Unauthorized message"), mentions, 0);

        channel::delete_channel_for_testing(channel_id);
    }

    #[test]
    fun test_message_pagination() {
        nuwa_framework::genesis::init_for_test();
        let user = test_helper::create_test_account();
         
        let channel_id = create_ai_home_channel_for_test();
        
        // Send multiple messages
        let channel = object::borrow_mut_object_shared(channel_id);
        channel_entry::join_channel(&user, channel);
        let i = 0;
        let mentions = vector::empty();
        while (i < 5) {
            let (_, _) = channel::send_message_for_test(&user, channel, string::utf8(b"Message"), mentions, 0);
            i = i + 1;
        };
        
        // Test pagination
        let channel = object::borrow_object(channel_id);
        let messages = channel::get_messages_paginated(channel, 1, 2);
        assert!(vector::length(&messages) == 2, 0);
        
        // Test last messages
        let messages = channel::get_last_messages(channel, 3);
        assert!(vector::length(&messages) == 3, 1);

        channel::delete_channel_for_testing(channel_id);
    }

    #[test]
    fun test_member_info() {
        nuwa_framework::genesis::init_for_test();
        let user = test_helper::create_test_account();
        let channel_id = create_ai_home_channel_for_test();
        let now = timestamp::now_milliseconds();
        
        let channel = object::borrow_mut_object_shared(channel_id);
        channel_entry::join_channel(&user, channel);
        let (joined_at, last_active) = channel::get_member_info(channel, signer::address_of(&user));
        assert!(joined_at == now, 0);
        assert!(last_active == now, 1);

        channel::delete_channel_for_testing(channel_id);
    }
}