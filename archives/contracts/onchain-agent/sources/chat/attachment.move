module nuwa_framework::attachment {
    use std::string::{Self, String};
    use moveos_std::decimal_value::{DecimalValue};
    use moveos_std::json;

    const MESSAGE_ATTACHMENT_TYPE_COIN: u8 = 0;
    public fun attachment_type_coin(): u8 { MESSAGE_ATTACHMENT_TYPE_COIN }

    #[data_struct]
    struct Attachment has copy, drop, store {
        attachment_type: u8,
        attachment_json: String,
    }

    #[data_struct]
    struct CoinAttachment has copy, drop, store {
        coin_type: String,
        coin_symbol: String,
        to: address,
        amount: DecimalValue,
    }

    public fun new_coin_attachment(coin_type: String, coin_symbol: String, to: address, amount: DecimalValue): Attachment {
        let coin_attachment = CoinAttachment {
            coin_type,
            coin_symbol,
            to,
            amount,
        };
        Attachment {
            attachment_type: attachment_type_coin(),
            attachment_json: string::utf8(json::to_json(&coin_attachment)),
        }
    }
}