module nuwa_framework::task_entry {
    use std::string::String;
    use moveos_std::signer;
    use moveos_std::object::{Self, ObjectID};
    use rooch_framework::coin;
    use rooch_framework::gas_coin::RGas;
    use nuwa_framework::task;
    use nuwa_framework::channel::{Self, Channel};
    use nuwa_framework::channel_entry;
    
    public entry fun start_task(resolver: &signer, task_id: ObjectID, message: String) {
        let resolver_address = signer::address_of(resolver);
        let task = task::borrow_mut_task(task_id);
        task::start_task(resolver_address, task);
        //The task object owner is the agent address
        let agent_address = object::owner(task);
        let channel_id = task::get_response_channel_id(task);
        let channel_obj = object::borrow_mut_object_shared<Channel>(channel_id);
        channel::add_ai_response(channel_obj, message, agent_address, 0);
    }

    public entry fun resolve_task(resolver: &signer, task_id: ObjectID, result: String) {
        let resolver_address = signer::address_of(resolver);
        let task = task::borrow_mut_task(task_id);
        task::resolve_task(resolver_address, task, result);
        let agent_address = object::owner(task);
        let channel_id = task::get_response_channel_id(task);
        let channel_obj = object::borrow_mut_object_shared<Channel>(channel_id);
        channel::add_ai_response(channel_obj, result, agent_address, 0);
    }

    public entry fun resolve_task_and_call_agent(resolver: &signer, task_id: ObjectID, result: String) {
        let resolver_address = signer::address_of(resolver);
        let task = task::borrow_mut_task(task_id);
        task::resolve_task(resolver_address, task, result);
        let agent_address = object::owner(task);
        let channel_id = task::get_response_channel_id(task);
        let channel_obj = object::borrow_mut_object_shared<Channel>(channel_id);
        channel::add_ai_response(channel_obj, result, agent_address, 0);
        channel_entry::call_agent_process_message(channel_obj, agent_address, coin::zero<RGas>());
    }

    public entry fun fail_task(resolver: &signer, task_id: ObjectID, message: String) {
        let resolver_address = signer::address_of(resolver);
        let task = task::borrow_mut_task(task_id);
        task::fail_task(resolver_address, task);
        let agent_address = object::owner(task);
        let channel_id = task::get_response_channel_id(task);
        let channel_obj = object::borrow_mut_object_shared<Channel>(channel_id);
        channel::add_ai_response(channel_obj, message, agent_address, 0);
    }
}