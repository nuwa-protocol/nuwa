module nuwa_framework::price_provider {
    use std::string::{Self, String};
    use std::vector;
    use moveos_std::object::{Object};
    use moveos_std::json;
    use moveos_std::decimal_value::{Self, DecimalValue};
    use gas_market::trusted_oracle;
    use nuwa_framework::agent::{Agent};
    use nuwa_framework::agent_state::{Self, AgentState};

    friend nuwa_framework::state_providers;

    const BTC_USD: vector<u8> = b"BTCUSD";
    
    #[data_struct]
    struct PriceState has copy, drop, store {
        coin_symbol: String,
        price: DecimalValue,
    }

    public(friend) fun get_state(_agent: &Object<Agent>): AgentState {
        let price_states = get_price_states();
        let state_json = string::utf8(json::to_json(&price_states));
        let agent_state = agent_state::new_agent_state(string::utf8(b"Coin prices in USD"), state_json);
        agent_state
    }

    fun get_price_states(): vector<PriceState> {
        let price_states = vector::empty();
        let price_state = PriceState {
            coin_symbol: string::utf8(b"RGas"),
            // 0.01 in USD
            price: decimal_value::new(1, 2),
        };
        vector::push_back(&mut price_states, price_state);
        let btc_price = trusted_oracle::trusted_price(string::utf8(BTC_USD));
        let btc_price_state = PriceState {
            coin_symbol: string::utf8(b"BTC"),
            price: btc_price,
        };
        vector::push_back(&mut price_states, btc_price_state);
        price_states
    }
 
}