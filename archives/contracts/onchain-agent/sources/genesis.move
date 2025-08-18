module nuwa_framework::genesis {
    use nuwa_framework::name_registry;
    use nuwa_framework::ai_service;
    
    fun init(){
        name_registry::genesis_init();
        ai_service::genesis_init();
    }
    

    #[test_only]
    public fun init_for_test(){
        //rooch_framework::genesis::init_for_test();
        bitcoin_move::genesis::init_for_test();
        gas_market::trusted_oracle::init_for_test();
        init(); 
    }
}