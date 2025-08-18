#[test_only]
module nuwa_framework::test_helper {
    use moveos_std::account;
    use moveos_std::tx_context;
    use rooch_framework::gas_coin;
    use rooch_framework::account_coin_store;

    #[test_only]
    public fun create_test_account_with_address(addr: address): signer {
        let s = account::create_signer_for_testing(addr);
        let gas_coin = gas_coin::mint_for_test(1000000000000);
        account_coin_store::deposit(addr, gas_coin);
        s
    }

    #[test_only]
    public fun create_test_account(): signer {
        let addr = tx_context::fresh_address();
        create_test_account_with_address(addr)
    }
}