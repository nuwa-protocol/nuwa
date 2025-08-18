module nuwa_framework::balance_state{
    use std::string::String;
    use moveos_std::decimal_value::{Self, DecimalValue};
    use moveos_std::type_info;
    use rooch_framework::coin;
    use rooch_framework::account_coin_store;

    #[data_struct]
    struct BalanceState has copy, drop, store {
        coin_symbol: String,
        coin_type: String,
        balance: DecimalValue,
    }
    
    public fun get_balance_state<CoinType: key>(addr: address): BalanceState {
        let balance = account_coin_store::balance<CoinType>(addr);
        let coin_symbol = coin::symbol_by_type<CoinType>();
        let coin_type = type_info::type_name<CoinType>();
        let decimals = coin::decimals_by_type<CoinType>();
        let balance_state = BalanceState {
            coin_symbol,
            coin_type,
            balance: decimal_value::new(balance, decimals),
        };
        balance_state
    }

    public fun get_coin_symbol(balance_state: &BalanceState): &String {
        &balance_state.coin_symbol
    }

    public fun get_coin_type(balance_state: &BalanceState): &String {
        &balance_state.coin_type
    }

    public fun get_balance(balance_state: &BalanceState): DecimalValue {
        balance_state.balance
    }
}