module nuwa_framework::name_registry {
    use std::vector;
    use std::string::{Self, String};
    use moveos_std::object::{Self, Object};
    use moveos_std::event;
    use moveos_std::signer;
    use moveos_std::string_utils::{to_lower_case};

    use rooch_framework::coin_store::{Self, CoinStore};
    use rooch_framework::account_coin_store;
    use rooch_framework::gas_coin::RGas;
    use nuwa_framework::user_input_validator;
    use nuwa_framework::config;

    friend nuwa_framework::agent;
    friend nuwa_framework::genesis;

    /// Error codes
    const ErrorUsernameAlreadyRegistered: u64 = 1;
    const ErrorUsernameNotRegistered: u64 = 2;
    const ErrorNotOwner: u64 = 3;
    const ErrorAddressAlreadyRegistered: u64 = 4;

    /// Events
    struct UsernameRegistered has drop, copy, store {
        username: String,
        addr: address,
    }

    struct UsernameUnregistered has drop, copy, store {
        username: String,
        addr: address,
    }

    /// Empty struct for the registry object
    struct NameRegistry has key {
        fee: Object<CoinStore<RGas>>,
    }
    
    /// Initialize the registry
    public(friend) fun genesis_init() {
        let coin_store = coin_store::create_coin_store<RGas>();
        let registry = NameRegistry {
            fee: coin_store
        };
        let registry_obj = object::new_named_object(registry);
        object::to_shared(registry_obj);
    }

    /// Get the registry object
    fun borrow_registry_object(): &Object<NameRegistry> {
        let registry_obj_id = object::named_object_id<NameRegistry>();
        object::borrow_object<NameRegistry>(registry_obj_id)
    }

    /// Get mutable reference to registry object
    fun borrow_mut_registry_object(): &mut Object<NameRegistry> {
        let registry_obj_id = object::named_object_id<NameRegistry>();
        object::borrow_mut_object_shared<NameRegistry>(registry_obj_id)
    }

    /// Register a username for an object
    public(friend) fun register_username_internal(addr: address, username: String) {
        // Convert username to lowercase
        let lowercase_username = to_lower_case(&username);
        
        // Validate the username
        user_input_validator::validate_name(&lowercase_username);
        
        let registry_mut = borrow_mut_registry_object();
        
        // Check if username is already registered (case insensitive)
        assert!(!object::contains_field(registry_mut, lowercase_username), ErrorUsernameAlreadyRegistered);
        assert!(!object::contains_field(registry_mut, addr), ErrorAddressAlreadyRegistered);
        
        // Register the username by adding a field to the registry object
        object::add_field(registry_mut, lowercase_username, addr);
        object::add_field(registry_mut, addr, lowercase_username);
        
        // Emit event with original username
        event::emit(UsernameRegistered { username: lowercase_username, addr });
    }

    /// Register a username, the caller must have enough RGas to pay for the registration fee
    public entry fun register_username(caller: &signer, username: String) {
        let fee_amount = config::get_username_registration_fee();
        let fee = account_coin_store::withdraw<RGas>(caller, fee_amount);
        let registry_obj = borrow_mut_registry_object();
        coin_store::deposit(&mut object::borrow_mut(registry_obj).fee, fee);
        register_username_internal(signer::address_of(caller), username);
    }

    /// Unregister a username
    public(friend) fun unregister_username(username: String) {
        let registry_mut = borrow_mut_registry_object();
        
        // Check if username exists
        if(!object::contains_field(registry_mut, username)){
            return
        };
        
        // Remove the username
        let addr = object::remove_field(registry_mut, username);
        let _name: String = object::remove_field(registry_mut, addr);
        // Emit event
        event::emit(UsernameUnregistered { username, addr });
    }
    
    /// Check if a username is available (case insensitive)
    public fun is_username_available(username: &String): bool {
        let registry = borrow_registry_object();
        let lowercase_username = to_lower_case(username);
        !object::contains_field(registry, lowercase_username)
    }
    
    /// Get object ID by username (case insensitive), return 0x0 if not registered
    public fun get_address_by_username(username: &String): address {
        let registry = borrow_registry_object();
        let lowercase_username = to_lower_case(username);
        if(!object::contains_field(registry, lowercase_username)){
            @0x0
        }else{
            *object::borrow_field(registry, lowercase_username)
        }
    }

    /// Get username by address, return the address to string if not registered
    public fun get_username_by_address(addr: address): String {
        let registry = borrow_registry_object();
        if(!object::contains_field(registry, addr)){
            string::utf8(b"")
        }else{
            *object::borrow_field(registry, addr)
        }
    }

    public fun get_username_by_addreses(addresses: vector<address>): vector<String> {
        let registry = borrow_registry_object();
        let usernames = vector[];
        let i = 0;
        let length = vector::length(&addresses);
        while (i < length) {
            let addr = *vector::borrow(&addresses, i);
            let username = if(object::contains_field(registry, addr)){
                *object::borrow_field(registry, addr)
            }else{
                string::utf8(b"")
            };
            vector::push_back(&mut usernames, username);
            i = i + 1;
        };
        usernames
    }

    /// Get addresses by usernames, the caller must ensure the usernames are lowercase, because batch to lower case is expensive
    public fun get_address_by_usernames(usernames: vector<String>): vector<address> {
        let registry = borrow_registry_object();
        let addresses = vector[];
        let i = 0;
        let length = vector::length(&usernames);
        while (i < length) {
            let username = *vector::borrow(&usernames, i);
            let address = if(object::contains_field(registry, username)){
                *object::borrow_field(registry, username)
            }else{
                @0x0
            };
            vector::push_back(&mut addresses, address);
            i = i + 1;
        };
        addresses
    }


    #[test]
    fun test_registry() {
        use std::string;
        use moveos_std::tx_context;
       
        rooch_framework::genesis::init_for_test();
        genesis_init();
        
        let addr = tx_context::fresh_address();

        // Test username registration
        let username = string::utf8(b"testuser");
        assert!(is_username_available(&username), 0);
        
        register_username_internal(addr, username);
        assert!(!is_username_available(&username), 1);
        
        let stored_addr = get_address_by_username(&username);
        assert!(stored_addr == addr, 2);
        
        // Test unregistering
        unregister_username(username);
        assert!(is_username_available(&username), 3);
    }
}