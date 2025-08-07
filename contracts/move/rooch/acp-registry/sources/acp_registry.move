module acp_registry::acp_registry {

    use std::signer::address_of;
    use std::string;
    use std::string::String;
    use std::vector;
    use moveos_std::string_utils;
    use moveos_std::event::emit;
    use rooch_framework::did::{get_did_identifier_string, doc_id};
    use rooch_framework::did;
    use moveos_std::object::{Object, ObjectID};
    use moveos_std::table;
    use moveos_std::object;
    use moveos_std::table::Table;

    struct RegistrationInfo has key {
        registry: Table<String, ObjectID>
    }

    struct AgentCapability has key {
        cap_uri: String,
        creator: address,
        version: u64,
        cid: String,
    }

    struct RegisterEvent has store, copy, drop {
        cap_uri: String,
        creator: address,
        cid: String,
    }

    struct UpdateEvent has store, copy, drop {
        cap_uri: String,
        creator: address,
        version: u64,
        cid: String,
    }

    const ErrorCapURIAlreadyRegitser: u64 = 1;
    const ErrorCapURINotRegitser: u64 = 2;
    const ErrorInvalidChar: u64 = 3;

    fun init() {
        let registration_info_obj = object::new_named_object(RegistrationInfo{
            registry: table::new()
        });
        object::to_shared(registration_info_obj);
    }


        /// Get the registry object
    fun borrow_registration_info_object(): &Object<RegistrationInfo> {
        let registry_obj_id = object::named_object_id<RegistrationInfo>();
        object::borrow_object<RegistrationInfo>(registry_obj_id)
    }

    /// Get mutable reference to registry object
    fun borrow_mut_registration_info_object(): &mut Object<RegistrationInfo> {
        let registry_obj_id = object::named_object_id<RegistrationInfo>();
        object::borrow_mut_object_shared<RegistrationInfo>(registry_obj_id)
    }

    public fun is_validate_string(s: &String): bool {
        let bytes = string::bytes(s);
        let len = vector::length(bytes);

        // Check length (6-20)
        if (len < 6 || len > 20) {
            return false
        };

        // Check if the first character is a letter
        let first_char = *vector::borrow(bytes, 0);
        if (!is_alpha(first_char)) {
            return false
        };

        // Check if all characters are valid
        let i = 0;
        while (i < len) {
            let char = *vector::borrow(bytes, i);
            if (!is_valid_char(char)) {
                return false
            };
            i = i + 1;
        };

        true
    }

    /// Check if the character is a letter (A-Z, a-z)
    fun is_alpha(char: u8): bool {
        (char >= 65 && char <= 90) || // A-Z
        (char >= 97 && char <= 122)   // a-z
    }

    /// Check if the characters are valid (letters, numbers, or underscores)
    fun is_valid_char(char: u8): bool {
        is_alpha(char) ||
        (char >= 48 && char <= 57) || // 0-9
        char == 95                    // _
    }

    public entry fun register (account: &signer, name: String, cid: String) {
        assert!(is_validate_string(&name), ErrorInvalidChar);
        let creator = address_of(account);
        let did_document = did::get_did_document_by_address(creator);
        let cap_uri = get_did_identifier_string(doc_id(did_document));
        string::append_utf8(&mut cap_uri, b":");
        string::append(&mut cap_uri, name);
        let agent_capability_obj_id = object::custom_object_id<String, AgentCapability>(cap_uri);
        if (object::exists_object_with_type<AgentCapability>(agent_capability_obj_id)) {
            let mut_agent_capability_obj = object::borrow_mut_object<AgentCapability>(account, agent_capability_obj_id);
            let mut_agent_capability = object::borrow_mut(mut_agent_capability_obj);
            mut_agent_capability.version = mut_agent_capability.version + 1;
            mut_agent_capability.cid = cid;
            emit(UpdateEvent{
                cap_uri: mut_agent_capability.cap_uri,
                creator: mut_agent_capability.creator,
                version: mut_agent_capability.version,
                cid: mut_agent_capability.cid
            });
            return
        };
        let agent_capability = object::new_with_id(cap_uri, AgentCapability{
            cap_uri,
            creator,
            version: 0,
            cid
        });
        let agent_capability_id = object::id(&agent_capability);
        let mut_registration_info_obj = borrow_mut_registration_info_object();
        let mut_registration_info = object::borrow_mut(mut_registration_info_obj);
        assert!(!table::contains(&mut_registration_info.registry, cap_uri), ErrorCapURIAlreadyRegitser);
        table::add(&mut mut_registration_info.registry, cap_uri, agent_capability_id);
        object::transfer_extend(agent_capability, creator);
        emit(RegisterEvent{
            cap_uri,
            creator,
            cid
        })
    }

    public entry fun update(agent_capability_obj: &mut Object<AgentCapability>, cid: String) {
        let agent_capability = object::borrow_mut(agent_capability_obj);
        agent_capability.version = agent_capability.version + 1;
        agent_capability.cid = cid;
        emit(UpdateEvent{
            cap_uri: agent_capability.cap_uri,
            creator: agent_capability.creator,
            version: agent_capability.version,
            cid: agent_capability.cid
        })
    }

    public fun get_agent_capability_id(creator: address, name: String): ObjectID {
        let did_document = did::get_did_document_by_address(creator);
        let cap_uri = get_did_identifier_string(doc_id(did_document));
        string::append_utf8(&mut cap_uri, b":");
        string::append(&mut cap_uri, name);
        object::custom_object_id<String, AgentCapability>(cap_uri)
    }

    public fun resolve_cap_uri(cap_uri: String): &AgentCapability {
        let registration_info_obj = borrow_registration_info_object();
        let registration_info = object::borrow(registration_info_obj);
        assert!(!table::contains(&registration_info.registry, cap_uri), ErrorCapURINotRegitser);
        object::borrow(object::borrow_object<AgentCapability>(*table::borrow(&registration_info.registry, cap_uri)))
    }

    public fun get_cap_uri(registry: &AgentCapability): String {
        registry.cap_uri
    }

    public fun get_creator(registry: &AgentCapability): address {
        registry.creator
    }

    public fun get_version(registry: &AgentCapability): u64 {
        registry.version
    }

    public fun get_cid(registry: &AgentCapability): String {
        registry.cid
    }

    public fun get_cap_uri_with_version(registry: &AgentCapability): String {
        let cap_uri = registry.cap_uri;
        string::append_utf8(&mut cap_uri, b"@");
        string::append(&mut cap_uri, string_utils::to_string_u64(registry.version));
        cap_uri
    }
}