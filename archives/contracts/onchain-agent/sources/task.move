module nuwa_framework::task{
    use std::string::String;
    use std::option::{Self, Option};
    use moveos_std::object::{Self, ObjectID, Object};
    use moveos_std::event;
    use moveos_std::event_queue;
    use moveos_std::address;

    friend nuwa_framework::task_action;
    friend nuwa_framework::task_entry;
    const ErrorInvalidTaskResolver: u64 = 1;
    const ErrorInvalidTaskStatus: u64 = 2;
    const TASK_STATUS_PENDING: u8 = 0;
    public fun task_status_pending(): u8 {
        TASK_STATUS_PENDING
    }
    const TASK_STATUS_RUNNING: u8 = 1;
    public fun task_status_running(): u8 {
        TASK_STATUS_RUNNING
    }
    const TASK_STATUS_COMPLETED: u8 = 2;
    public fun task_status_completed(): u8 {
        TASK_STATUS_COMPLETED
    }
    const TASK_STATUS_FAILED: u8 = 3;
    public fun task_status_failed(): u8 {
        TASK_STATUS_FAILED
    }
    
    struct Task has key {
        name: String,
        /// json string of arguments
        arguments: String,
        response_channel_id: ObjectID,
        result: Option<String>,
        resolver: address,
        on_chain: bool,
        status: u8,
    }

    struct TaskPublishEvent has copy, drop, store {
        agent_address: address,
        task_id: ObjectID,
        name: String,
        arguments: String,
    }

    fun new_task(name: String, arguments: String, response_channel_id: ObjectID, resolver: address, on_chain: bool): Task {
        Task {
            name,
            arguments,
            response_channel_id,
            result: option::none(),
            resolver,
            on_chain,
            status: task_status_pending(),
        }
    }

    public(friend) fun publish_task(agent_address: address,name: String, arguments: String, response_channel_id: ObjectID, resolver: address, on_chain: bool) : ObjectID {
        let task = new_task(name, arguments, response_channel_id, resolver, on_chain);
        let task_obj = object::new(task);
        let task_obj_id = object::id(&task_obj);
        object::transfer_extend(task_obj, agent_address);
        if (on_chain) {
            let name = address::to_string(&agent_address);
            event_queue::emit(name, TaskPublishEvent {
                agent_address,
                task_id: task_obj_id,
                name,
                arguments,
            });
        }else{
            let handle = event::custom_event_handle_id<address, TaskPublishEvent>(agent_address);
            event::emit_with_handle(handle, TaskPublishEvent {
                agent_address,
                task_id: task_obj_id,
                name,
                arguments,
            });
        };
        task_obj_id
    }

    public(friend) fun borrow_mut_task(task_id: ObjectID): &mut Object<Task> {
        let task_obj = object::borrow_mut_object_extend<Task>(task_id);
        task_obj
    }

    public(friend) fun start_task(resolver: address, task_obj: &mut Object<Task>) {
        let task = object::borrow_mut(task_obj);
        assert!(task.resolver == resolver, ErrorInvalidTaskResolver);
        assert!(task.status == TASK_STATUS_PENDING, ErrorInvalidTaskStatus);
        task.status = TASK_STATUS_RUNNING;
    }

    public(friend) fun resolve_task(resolver: address, task_obj: &mut Object<Task>, result: String) {
        let task = object::borrow_mut(task_obj);
        assert!(task.resolver == resolver, ErrorInvalidTaskResolver);
        assert!(task.status == TASK_STATUS_PENDING || task.status == TASK_STATUS_RUNNING, ErrorInvalidTaskStatus);
        task.result = option::some(result);
        task.status = TASK_STATUS_COMPLETED;
    }

    public(friend) fun fail_task(resolver: address, task_obj: &mut Object<Task>) {
        let task = object::borrow_mut(task_obj);
        assert!(task.resolver == resolver, ErrorInvalidTaskResolver);
        assert!(task.status == TASK_STATUS_PENDING || task.status == TASK_STATUS_RUNNING, ErrorInvalidTaskStatus);
        task.status = TASK_STATUS_FAILED;
    }

    public fun get_status(task_obj: &Object<Task>): u8 {
        let task = object::borrow(task_obj);
        task.status
    }

    public fun get_response_channel_id(task_obj: &Object<Task>): ObjectID {
        let task = object::borrow(task_obj);
        task.response_channel_id
    }

    public fun get_result(task_obj: &Object<Task>): Option<String> {
        let task = object::borrow(task_obj);
        task.result
    }

}