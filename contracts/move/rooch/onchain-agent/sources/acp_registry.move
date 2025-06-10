module nuwa_framework::acp_registry {

    use std::signer::address_of;
    use std::string;
    use std::string::String;
    use moveos_std::event::emit;
    use rooch_framework::did::get_did_identifier;
    use rooch_framework::did;
    use moveos_std::object::Object;
    use moveos_std::table;
    use moveos_std::object;
    use moveos_std::table::Table;

    struct RegistrationInfo has key {
        registry: Table<String, Registry>
    }

    struct Registry has store {
        cap_uri: String,
        semver: String,
        cid: String,
    }

    struct RegisterEvent has store, copy, drop {
        cap_uri: String,
        semver: String,
        cid: String,
    }

    const ErrorCapURIAlreadyRegitser: u64 = 1;
    const ErrorCapURINotRegitser: u64 = 2;

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

    public entry fun register (account: &signer, name: String, semver: String, cid: String) {
        let did_document = did::get_did_document(address_of(account));
        let cap_uri = did::format_did(get_did_identifier(did_document));
        string::append_utf8(&mut cap_uri, b":");
        string::append(&mut cap_uri, name);
        string::append_utf8(&mut cap_uri, b"@");
        string::append(&mut cap_uri, semver);
        let mut_registration_info_obj = borrow_mut_registration_info_object();
        let mut_registration_info = object::borrow_mut(mut_registration_info_obj);
        assert!(!table::contains(&mut_registration_info.registry, cap_uri), ErrorCapURIAlreadyRegitser);
        table::add(&mut mut_registration_info.registry, cap_uri, Registry{
            cap_uri,
            semver,
            cid,
        });
        emit(RegisterEvent{
            cap_uri,
            semver,
            cid
        })
    }

    public fun resolve_cap_uri(cap_uri: String): &Registry {
        let registration_info_obj = borrow_registration_info_object();
        let registration_info = object::borrow(registration_info_obj);
        assert!(!table::contains(&registration_info.registry, cap_uri), ErrorCapURINotRegitser);
        table::borrow(&registration_info.registry, cap_uri)
    }

    public fun get_cap_uri(registry: &&Registry): String {
        registry.cap_uri
    }

    public fun get_semver(registry: &&Registry): String {
        registry.semver
    }

    public fun get_cid(registry: &&Registry): String {
        registry.cid
    }
}
