module nuwa_framework::channel {
    use std::string::{Self, String};
    use std::vector;
    use std::option::{Self, Option};
    use moveos_std::table::{Self, Table};
    use moveos_std::object::{Self, Object, ObjectID};
    use moveos_std::timestamp;
    use moveos_std::signer;
    use moveos_std::event;
    use nuwa_framework::message;
    use nuwa_framework::agent::{Self, Agent};
    use nuwa_framework::attachment::{Attachment};
    use nuwa_framework::user_input_validator::{validate_channel_title, validate_channel_message};
    use nuwa_framework::user_joined_channels;

    friend nuwa_framework::response_action;
    friend nuwa_framework::task_entry;
    friend nuwa_framework::channel_entry;
    friend nuwa_framework::agent_runner;
    friend nuwa_framework::agent_entry;
    
    // Error codes
    const ErrorChannelNotFound: u64 = 1;
    const ErrorChannelAlreadyExists: u64 = 2;
    const ErrorNotAuthorized: u64 = 3;
    const ErrorChannelInactive: u64 = 4;
    const ErrorMaxMembersReached: u64 = 5;
    const ErrorInvalidChannelName: u64 = 6;
    const ErrorInvalidChannelType: u64 = 7;
    const ErrorNotMember: u64 = 8;
    const ErrorDeprecatedFunction: u64 = 9;
    const ErrorMentionedUserNotMember: u64 = 10;
    const ErrorInvalidReplyTo: u64 = 11;

    /// Channel status constants
    const CHANNEL_STATUS_ACTIVE: u8 = 0;
    const CHANNEL_STATUS_CLOSED: u8 = 1;
    const CHANNEL_STATUS_BANNED: u8 = 2;


    // Channel type constants
    const CHANNEL_TYPE_AI_HOME: u8 = 0;   // AI's home channel, always public
    const CHANNEL_TYPE_TOPIC: u8 = 1;     // Topic channel

    // Public functions to expose channel types
    public fun channel_type_ai_home(): u8 { CHANNEL_TYPE_AI_HOME }
    public fun channel_type_topic(): u8 { CHANNEL_TYPE_TOPIC }

    const CHANNEL_JOIN_POLICY_PUBLIC: u8 = 0;
    public fun channel_join_policy_public(): u8 { CHANNEL_JOIN_POLICY_PUBLIC }
    const CHANNEL_JOIN_POLICY_INVITE: u8 = 1;
    public fun channel_join_policy_invite(): u8 { CHANNEL_JOIN_POLICY_INVITE }

    /// Member structure to store member information
    struct Member has store, drop {
        address: address,
        joined_at: u64,    // Now in milliseconds
        last_active: u64,  // Now in milliseconds
    }

    /// Channel structure for chat functionality
    /// Note on privacy:
    /// - All messages in the channel are visible on-chain, regardless of channel privacy settings
    /// - is_public: true  => Anyone can join the channel automatically when sending their first message
    /// - is_public: false => Only admins can add members, and only members can send messages
    struct Channel has key {
        /// Parent channel id, for topic channel
        parent_channel: Option<ObjectID>,
        title: String,
        creator: address, 
        members: Table<address, Member>,  
        messages: Table<u64, ObjectID>,
        topics: Table<String, ObjectID>,
        message_counter: u64,
        /// Channel creation time in milliseconds
        created_at: u64,    
        /// Last message time in milliseconds
        last_active: u64,   
        /// Channel status
        status: u8,
        /// Channel type
        channel_type: u8, 
        /// Channel join policy
        join_policy: u8,
    }

    struct NewChannelEvent has store, copy, drop {
        channel_id: ObjectID,
        channel_type: u8,
    }

    /// Initialize a new AI home channel
    public(friend) fun create_ai_home_channel(
        agent: &mut Object<Agent>,
    ): ObjectID {
        let agent_address = agent::get_agent_address(agent);
        let channel_id = object::account_named_object_id<Channel>(agent_address);
        assert!(!object::exists_object(channel_id), ErrorChannelAlreadyExists);
        
        let title = string::utf8(b"Home channel");
        let creator = agent_address;
        let now = timestamp::now_milliseconds();
        
        let channel = Channel {
            parent_channel: option::none(),
            title,
            creator,  
            members: table::new(),
            messages: table::new(),
            topics: table::new(),
            message_counter: 0,
            created_at: now,
            last_active: now,
            status: CHANNEL_STATUS_ACTIVE,
            channel_type: CHANNEL_TYPE_AI_HOME,
            join_policy: CHANNEL_JOIN_POLICY_PUBLIC,
        };

        // Every AI can only have one AI_HOME channel
        let channel_obj = object::new_account_named_object(creator, channel);
        join_channel_internal(creator, &mut channel_obj, now);
        let channel_id = object::id(&channel_obj);
        object::to_shared(channel_obj);
        let event = NewChannelEvent {
            channel_id,
            channel_type: CHANNEL_TYPE_AI_HOME,
        };
        event::emit(event);
        channel_id
    }

    public fun get_agent_home_channel_id(agent: &Object<Agent>): ObjectID {
        let agent_address = agent::get_agent_address(agent);
        object::account_named_object_id<Channel>(agent_address)
    }

    public fun create_topic_channel(
        user_account: &signer,
        parent_channel_obj: &mut Object<Channel>,
        topic: String,
        join_policy: u8,
    ): ObjectID {
        validate_channel_title(&topic);
    
        let user_address = signer::address_of(user_account);
        //Only parent channel members can create topic channel
        assert!(is_channel_member(parent_channel_obj, user_address), ErrorNotMember);
        let parent_channel_id = object::id(parent_channel_obj);
        let parent_channel = object::borrow_mut(parent_channel_obj);
        //Only AI_HOME channel can create topic channel
        assert!(parent_channel.channel_type == CHANNEL_TYPE_AI_HOME, ErrorInvalidChannelType);
        //The creator of the parent channel is ai agent
        let agent_address = parent_channel.creator;

        let now = timestamp::now_milliseconds();
        let channel = Channel {
            parent_channel: option::some(parent_channel_id),
            title: topic,
            creator: agent_address,
            members: table::new(),
            messages: table::new(),
            topics: table::new(),
            message_counter: 0,
            created_at: now,
            last_active: now,
            status: CHANNEL_STATUS_ACTIVE,
            channel_type: CHANNEL_TYPE_TOPIC,
            join_policy: join_policy,
        };
        
        let channel_obj = object::new(channel);
        let channel_id = object::id(&channel_obj);
        table::add(&mut parent_channel.topics, topic, channel_id);
        join_channel_internal(user_address, &mut channel_obj, now);
        join_channel_internal(agent_address, &mut channel_obj, now);
        object::to_shared(channel_obj);
        let event = NewChannelEvent {
            channel_id,
            channel_type: CHANNEL_TYPE_TOPIC,
        };
        event::emit(event);
        channel_id
    }

    /// Add message to channel - use message_counter as id
    fun add_message(channel_obj: &mut Object<Channel>, sender: address, content: String, message_type: u8, mentions: vector<address>, reply_to: u64, attachments: vector<Attachment>):(ObjectID, u64) {
        let channel_id = object::id(channel_obj);
        let channel = object::borrow_mut(channel_obj);
        let index = channel.message_counter;
        let msg_id = message::new_message_object_with_attachment(
            index,
            channel_id,
            sender,
            content,
            message_type,
            mentions,
            reply_to,
            attachments
        );
        table::add(&mut channel.messages, index, msg_id);
        channel.message_counter = channel.message_counter + 1;
        (msg_id, index)
    }

    public(friend) fun send_message(
        account: &signer,
        channel_obj: &mut Object<Channel>,
        content: String,
        mentions: vector<address>,
        reply_to: u64,
        attachments: vector<Attachment>
    ):(ObjectID, u64) {
        validate_channel_message(&content);
        let channel_id = object::id(channel_obj);
        vector::for_each(mentions, |addr| {
            assert!(is_channel_member(channel_obj, addr), ErrorMentionedUserNotMember);
        });
        let sender = signer::address_of(account);
        let now = timestamp::now_milliseconds();
    
        let channel = object::borrow_mut(channel_obj);

        if(reply_to > 0) {
            assert!(table::contains(&channel.messages, reply_to), ErrorInvalidReplyTo);
        };

        assert!(channel.status == CHANNEL_STATUS_ACTIVE, ErrorChannelInactive);
       
        if (table::contains(&channel.members, sender)) {
             // Update member's last active time
            let member = table::borrow_mut(&mut channel.members, sender);
            member.last_active = now;
            channel.last_active = now;
        }else{
            // If sender is not a member, check the join policy, and add them as a member if the policy is public
            if (channel.join_policy == CHANNEL_JOIN_POLICY_PUBLIC) {
                join_channel_internal(sender, channel_obj, now);
            } else {
                abort ErrorNotMember
            };
        };
        
        user_joined_channels::active_in_channel(sender, channel_id, now);
        add_message(channel_obj, sender, content, message::type_normal(), mentions, reply_to, attachments)
    }

    /// Add AI response to the channel
    public(friend) fun add_ai_response(
        channel_obj: &mut Object<Channel>, 
        response_message: String, 
        ai_agent_address: address,
        reply_to: u64
    ):(ObjectID, u64) {
        add_message(channel_obj, ai_agent_address, response_message, message::type_normal(), vector::empty(), reply_to, vector::empty())
    }

    public(friend) fun add_ai_event(
        channel_obj: &mut Object<Channel>, 
        event: String, 
        ai_agent_address: address
    ){
        add_message(channel_obj, ai_agent_address, event, message::type_action_event(), vector::empty(), 0, vector::empty());
    }

    /// Get all message ids in the channel
    public fun get_messages(channel: &Object<Channel>): vector<ObjectID> {
        let channel_ref = object::borrow(channel);
        let messages = vector::empty<ObjectID>();
        let i = 0;
        while (i < channel_ref.message_counter) {
            let msg_id = table::borrow(&channel_ref.messages, i);
            vector::push_back(&mut messages, *msg_id);
            i = i + 1;
        };
        messages
    }

    /// Get message ids with pagination
    public fun get_messages_paginated(
        channel: &Object<Channel>, 
        start_index: u64,
        limit: u64
    ): vector<ObjectID> {
        let channel_ref = object::borrow(channel);
        let messages = vector::empty<ObjectID>();
        
        // Check if start_index is valid
        if (start_index >= channel_ref.message_counter) {
            return messages
        };
        
        // Calculate end index
        let end_index = if (start_index + limit > channel_ref.message_counter) {
            channel_ref.message_counter
        } else {
            start_index + limit
        };
        
        let i = start_index;
        while (i < end_index) {
            let msg_id = table::borrow(&channel_ref.messages, i);
            vector::push_back(&mut messages, *msg_id);
            i = i + 1;
        };
        messages
    }

    /// Get total message count in the channel
    public fun get_message_count(channel: &Object<Channel>): u64 {
        let channel_ref = object::borrow(channel);
        channel_ref.message_counter
    }

    /// Get message count for a batch of channels
    public fun get_message_count_batch(channels: vector<ObjectID>): vector<u64> {
        let message_counts = vector::empty<u64>();
        vector::for_each(channels, |channel_id| {
            let channel_obj = object::borrow_object<Channel>(channel_id);
            let channel = object::borrow(channel_obj);
            vector::push_back(&mut message_counts, channel.message_counter);
        });
        message_counts
    }

    /// Get last N messages from the channel
    public fun get_last_messages(channel_obj: &Object<Channel>, limit: u64): vector<ObjectID> {
        let channel = object::borrow(channel_obj);
        let messages = vector::empty();
        let start = if (channel.message_counter > limit) {
            channel.message_counter - limit
        } else {
            0
        };
        
        let i = start;
        while (i < channel.message_counter) {
            let msg_id = table::borrow(&channel.messages, i);
            vector::push_back(&mut messages, *msg_id);
            i = i + 1;
        };
        messages
    }

    /// Check if address is member of channel
    public fun is_member(channel: &Object<Channel>, addr: address): bool {
        let channel_ref = object::borrow(channel);
        table::contains(&channel_ref.members, addr)
    }

    /// Get member info
    public fun get_member_info(channel: &Object<Channel>, addr: address): (u64, u64) {
        let channel_ref = object::borrow(channel);
        assert!(table::contains(&channel_ref.members, addr), ErrorNotAuthorized);
        let member = table::borrow(&channel_ref.members, addr);
        (
            member.joined_at,
            member.last_active
        )
    } 

    /// Update channel title
    public(friend) fun update_channel_title(channel_obj: &mut Channel, new_title: String) {
        channel_obj.title = new_title;
    }

     /// Add member to channel
    fun add_member_internal(
        channel: &mut Channel, 
        member_addr: address,
        now: u64,
    ) : bool {
        if (!table::contains(&channel.members, member_addr)) {
            let member = Member {
                address: member_addr,
                joined_at: now,
                last_active: now,
            };
            table::add(&mut channel.members, member_addr, member);
            true
        } else {
            false
        }
    }

    fun join_channel_internal(
        member_addr: address,
        channel_obj: &mut Object<Channel>,
        now: u64,
    ) {
        let channel_id = object::id(channel_obj);
        let channel = object::borrow_mut(channel_obj);
        let is_added = add_member_internal(channel, member_addr, now);

        if (is_added) {
            let is_ai_home = channel.channel_type == CHANNEL_TYPE_AI_HOME;
        
            // We only record AI_HOME channel to user_joined_channels
            if (is_ai_home) {
                let agent_id = agent::get_agent_id_by_address(channel.creator);
                user_joined_channels::join_channel(member_addr, channel_id, agent_id, now);
            }
        }
    }

    /// Join channel
    public fun join_channel(
        account: &signer,
        channel_obj: &mut Object<Channel>,
    ) {
        let sender = signer::address_of(account);
        let channel = object::borrow_mut(channel_obj);
        
        // Only public channels can be joined directly
        assert!(channel.join_policy == CHANNEL_JOIN_POLICY_PUBLIC, ErrorNotAuthorized);
        
        let now = timestamp::now_milliseconds();
        join_channel_internal(sender, channel_obj, now); 
    }

    public(friend) fun leave_channel(
        account: &signer,
        channel_obj: &mut Object<Channel>,
    ) {
        let sender = signer::address_of(account);
        let channel_id = object::id(channel_obj);
        let channel = object::borrow_mut(channel_obj);
        if (table::contains(&channel.members, sender)) {
            table::remove(&mut channel.members, sender);
        };
        let is_ai_home = channel.channel_type == CHANNEL_TYPE_AI_HOME;
        if (is_ai_home) {
            user_joined_channels::leave_channel(sender, channel_id);
        }
    }

    // ==================== Getters ====================

    public fun get_title(channel: &Object<Channel>): &String {
        let channel_ref = object::borrow(channel);
        &channel_ref.title
    }

    public fun get_creator(channel: &Object<Channel>): address {
        let channel_ref = object::borrow(channel);
        channel_ref.creator
    }

    public fun get_created_at(channel: &Object<Channel>): u64 {
        let channel_ref = object::borrow(channel);
        channel_ref.created_at
    }

    public fun get_last_active(channel: &Object<Channel>): u64 {
        let channel_ref = object::borrow(channel);
        channel_ref.last_active
    }

    public fun get_status(channel: &Object<Channel>): u8 {
        let channel_ref = object::borrow(channel);
        channel_ref.status
    }

    public fun get_type(channel: &Object<Channel>): u8 {
        let channel_ref = object::borrow(channel);
        channel_ref.channel_type
    }

    public fun is_channel_member(channel: &Object<Channel>, addr: address): bool {
        let channel_ref = object::borrow(channel);
        table::contains(&channel_ref.members, addr)
    }

    public fun get_parent_channel(channel: &Object<Channel>): Option<ObjectID> {
        let channel_ref = object::borrow(channel);
        channel_ref.parent_channel
    }

    // =================== Test helpers ===================

    #[test_only]
    /// Test helper function to delete a channel, only available in test mode
    fun force_delete_channel(channel: Object<Channel>) {
        let Channel {
            parent_channel: _,
            title: _,
            creator: _,
            members,
            messages,
            topics,
            message_counter: _,
            created_at: _,
            last_active: _,
            status: _,
            channel_type: _,
            join_policy: _,
        } = object::remove(channel);
        
        table::drop(members);
        table::drop(messages);
        table::drop(topics);
    }

    #[test_only]
    public fun create_ai_home_channel_for_test(
        agent: &mut Object<Agent>,
    ): ObjectID {
        create_ai_home_channel(agent)
    }

    #[test_only]
    /// Public test helper function to delete a channel
    public fun delete_channel_for_testing(channel_id: ObjectID) {
        let channel = object::take_object_extend<Channel>(channel_id);
        force_delete_channel(channel);
    }

    #[test_only]
    public fun send_message_for_test(
        account: &signer,
        channel_obj: &mut Object<Channel>,
        content: String,
        mentions: vector<address>,
        reply_to: u64,
    ): (ObjectID, u64) {
        send_message(account, channel_obj, content, mentions, reply_to, vector::empty())
    }
}