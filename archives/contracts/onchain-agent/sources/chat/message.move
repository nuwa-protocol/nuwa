module nuwa_framework::message {
    use std::vector;
    use std::string::{String};
    use moveos_std::timestamp;
    use moveos_std::object::{Self, ObjectID};
    use moveos_std::event;
    use nuwa_framework::attachment::{Attachment};

    friend nuwa_framework::channel;
    friend nuwa_framework::agent_debugger;

    /// Message types
    const MESSAGE_TYPE_NORMAL: u8 = 0;
    public fun type_normal(): u8 { MESSAGE_TYPE_NORMAL }
    const MESSAGE_TYPE_ACTION_EVENT: u8 = 1;
    public fun type_action_event(): u8 { MESSAGE_TYPE_ACTION_EVENT }
    const SYSTEM_EVENT_MESSAGE: u8 = 2;
    public fun type_system_event(): u8 { SYSTEM_EVENT_MESSAGE }

    const MESSAGE_STATUS_NORMAL: u8 = 0;
    public fun status_normal(): u8 { MESSAGE_STATUS_NORMAL }
    const MESSAGE_STATUS_EDITED: u8 = 1;
    public fun status_edited(): u8 { MESSAGE_STATUS_EDITED }
    const MESSAGE_STATUS_DELETED: u8 = 2;
    public fun status_deleted(): u8 { MESSAGE_STATUS_DELETED }

    /// The message object structure
    /// The message object is owned by the sender
    /// But it is no `store` ability, so the owner can't transfer it to another account
    struct Message has key, copy, drop {
        index: u64,
        channel_id: ObjectID,  // Added channel_id
        sender: address,
        content: String,
        timestamp: u64,
        message_type: u8,
        /// The addresses mentioned in the message
        mentions: vector<address>,
        /// The index of the message being replied to
        /// If the message is not a reply, the value is 0, because the index of 0 is the system event message
        reply_to: u64,
        status: u8,
        attachments: vector<Attachment>,
    }

    struct MessageEvent has copy, store, drop {
        message_id: ObjectID,
        index: u64,
        channel_id: ObjectID,
        sender: address,
        message_type: u8,
    }

    /// Constructor - message belongs to the sender
    public(friend) fun new_message_object(
        index: u64, 
        channel_id: ObjectID,
        sender: address, 
        content: String, 
        message_type: u8,
        mentions: vector<address>,
        reply_to: u64,
    ): ObjectID {
        new_message_object_with_attachment(index, channel_id, sender, content, message_type, mentions, reply_to, vector::empty())
    }

    public(friend) fun new_message_object_with_attachment(
        index: u64, 
        channel_id: ObjectID,
        sender: address, 
        content: String, 
        message_type: u8,
        mentions: vector<address>,
        reply_to: u64,
        attachments: vector<Attachment>,
    ): ObjectID {
        let message = new_message(index, channel_id, sender, content, message_type, mentions, reply_to, attachments);
        let msg_obj = object::new(message);
        let msg_id = object::id(&msg_obj);
        object::transfer_extend(msg_obj, sender);
        let event = MessageEvent {
            message_id: msg_id,
            index,
            channel_id,
            sender,
            message_type,
        };
        let handle = event::custom_event_handle_id<ObjectID, MessageEvent>(channel_id);
        event::emit_with_handle(handle, event);
        msg_id
    }

    public(friend) fun new_message(
        index: u64, 
        channel_id: ObjectID,  // Added channel_id parameter
        sender: address, 
        content: String, 
        message_type: u8,
        mentions: vector<address>,
        reply_to: u64,
        attachments: vector<Attachment>,
    ): Message {
        Message {
            index,
            channel_id,
            sender,
            content,
            timestamp: timestamp::now_milliseconds(),
            message_type,
            mentions,
            reply_to,
            status: MESSAGE_STATUS_NORMAL,
            attachments,
        }
    }

    // Getters
    public fun get_index(message: &Message): u64 {
        message.index
    }

    public fun get_channel_id(message: &Message): ObjectID {
        message.channel_id
    }

    public fun get_content(message: &Message): String {
        message.content
    }

    public fun get_type(message: &Message): u8 {
        message.message_type
    }

    public fun get_timestamp(message: &Message): u64 {
        message.timestamp
    }

    public fun get_sender(message: &Message): address {
        message.sender
    }


    public fun get_mentions(message: &Message): &vector<address> {
        &message.mentions
    }

    public fun get_reply_to(message: &Message): u64 {
        message.reply_to
    }

    public fun get_message_type(message: &Message): u8 {
        message.message_type
    }

    public fun get_status(message: &Message): u8 {
        message.status
    }

    public fun get_attachments(message: &Message): &vector<Attachment> {
        &message.attachments
    }

    public fun get_messages_by_ids(message_ids: &vector<ObjectID>): vector<Message> {
        let messages = vector::empty<Message>();
        let i = 0;
        while (i < vector::length(message_ids)) {
            let message_id = vector::borrow(message_ids, i);
            let message_obj = object::borrow_object<Message>(*message_id);
            vector::push_back(&mut messages, *object::borrow(message_obj));
            i = i + 1;
        };
        messages
    }

    // =============== Tests helper functions ===============
    
    #[test_only]
    public fun new_message_for_test(
        id: u64, 
        channel_id: ObjectID, 
        sender: address, 
        content: String, 
        message_type: u8,
        mentions: vector<address>,
        reply_to: u64,
    ): Message {
        new_message(id, channel_id, sender, content, message_type, mentions, reply_to, vector::empty())
    }

    #[test]
    fun test_message_creation() {
        use std::string;
        use std::vector;
        let test_channel_id = object::derive_object_id_for_test();
        let mentions = vector::empty();
        vector::push_back(&mut mentions, @0x43);
        let msg_id = new_message_object(
            1, 
            test_channel_id, 
            @0x42, 
            string::utf8(b"test content"), 
            type_normal(),
            mentions,
            0
        );
        let msg_obj = object::borrow_object<Message>(msg_id);
        let msg = object::borrow(msg_obj);
        
        assert!(get_index(msg) == 1, 0);
        assert!(get_channel_id(msg) == test_channel_id, 1);
        assert!(get_content(msg) == string::utf8(b"test content"), 2);
        assert!(get_type(msg) == type_normal(), 3);
        assert!(get_sender(msg) == @0x42, 4);
        assert!(object::owner(msg_obj) == @0x42, 5);
    }
}