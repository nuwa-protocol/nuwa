module nuwa_framework::address_utils{
    use std::string::String;
    use moveos_std::address;

    friend nuwa_framework::memory_action;
    friend nuwa_framework::prompt_input;
    friend nuwa_framework::message;


    public(friend) fun parse_address(arg: &String): address {
        address::from_bech32_string(arg)
    }

     // Add helper function to convert address to string
    public(friend) fun address_to_string(addr: address): String {
        address::to_bech32_string(addr)
    }

    #[test]
    fun test_parse_address() {
        let address = moveos_std::tx_context::fresh_address();
        std::debug::print(&address);
        let address_str = address_to_string(address);
        std::debug::print(&address_str);
        let parsed_address = parse_address(&address_str);
        assert!(address == parsed_address, 1);
    }
}