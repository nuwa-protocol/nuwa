module nuwa_framework::index_table {
    use std::vector;
    use std::option::{Self, Option};
    use moveos_std::table::{Self, Table};
    
    struct IndexTable<phantom V: copy + drop + store> has store {
        table: Table<u64, V>,
        index: u64,
    }

    public fun new<V: copy + drop + store>(): IndexTable<V> {
        IndexTable {
            table: table::new(),
            index: 0,
        }
    }

    public fun add<V: copy + drop + store>(table: &mut IndexTable<V>, value: V) {
        table::add(&mut table.table, table.index, value);
        table.index = table.index + 1;
    }

    public fun upsert<V: copy + drop + store>(table: &mut IndexTable<V>, index: u64, value: V){
        if (table::contains(&table.table, index)){
            *table::borrow_mut(&mut table.table, index) = value;
        } else {
            table::add(&mut table.table, index, value);
            if (table.index <= index){
                table.index = index + 1;
            }
        }
    }

    public fun remove<V: copy + drop + store>(table: &mut IndexTable<V>, index: u64){
        if(table::contains(&table.table, index)){
            table::remove(&mut table.table, index);
        };
        if (table.index == index + 1){
            table.index = table.index - 1;
            if (table.index == 0){
                return
            };
            // check if the index slot is empty, if so, decrement the index
            let i = table.index -1;
            while (i >= 0){
                if (table::contains(&table.table, i)){
                    break
                };
                table.index = i;
                if (i == 0){
                    break
                };
                i = i - 1;
            }
        }
    }

    public fun get<V: copy + drop + store>(table: &IndexTable<V>, index: u64): Option<V> {
        if (table::contains(&table.table, index)){
            option::some(*table::borrow(&table.table, index))
        } else {
            option::none()
        }
    }

    public fun get_all<V: copy + drop + store>(table: &IndexTable<V>): vector<V> {
        let values = vector::empty();
        let i = 0;
        while (i < table.index){
            let value_opt = get(table, i);
            if (option::is_some(&value_opt)){
                vector::push_back(&mut values, option::destroy_some(value_opt));
            };
            i = i + 1;
        };
        values
    }

    public fun get_latest<V: copy + drop + store>(table: &IndexTable<V>, size: u64): vector<V> {
        let values = vector::empty();
        let count = 0;
        let start = table.index;
        while (count < size && start >= 0){
            let value_opt = get(table, start);
            if (option::is_some(&value_opt)){
                vector::push_back(&mut values, option::destroy_some(value_opt));
                count = count + 1;
            };
            if (start == 0){
                break
            };
            start = start - 1;
        };
        values
    }

    public fun get_index<V: copy + drop + store>(table: &IndexTable<V>): u64 {
        table.index
    }

    public fun drop<V: copy + drop + store>(table: IndexTable<V>){
        let IndexTable { table, index: _ } = table;
        table::drop(table);
    }

    #[test_only]
    struct TestValue has copy, drop, store {
        value: u64,
    }

    #[test]
    fun test_index_table_upsert(){
        let table = new();
        upsert(&mut table, 0, TestValue { value: 0 });
        upsert(&mut table, 1, TestValue { value: 1 });
        assert!(get_index(&table) == 2, 0);
        upsert(&mut table, 0, TestValue { value: 2 });
        assert!(get_index(&table) == 2, 1);
        upsert(&mut table, 3, TestValue { value: 3 });
        assert!(get_index(&table) == 4, 2);
        drop(table);
    }

    #[test]
    fun test_index_table_remove(){
        let table = new();
        upsert(&mut table, 0, TestValue { value: 0 });
        upsert(&mut table, 1, TestValue { value: 1 });
        assert!(get_index(&table) == 2, 0);
        remove(&mut table, 1);
        assert!(get_index(&table) == 1, 1);
        let values = get_all(&table);
        assert!(vector::length(&values) == 1, 2);
        assert!(vector::borrow(&values, 0).value == 0, 2);
        drop(table);
    }

    #[test]
    fun test_index_table_get(){
        let table = new();
        upsert(&mut table, 0, TestValue { value: 0 });
        upsert(&mut table, 1, TestValue { value: 1 });
        let value = get(&table, 0);
        assert!(option::is_some(&value), 0);
        assert!(option::destroy_some(value).value == 0, 1);

        let value = get(&table, 2);
        assert!(option::is_none(&value), 4);
        
        drop(table);
    }

    #[test]
    fun test_index_table_get_all(){
        let table = new();
        upsert(&mut table, 0, TestValue { value: 0 });
        upsert(&mut table, 1, TestValue { value: 1 });
        let values = get_all(&table);
        assert!(vector::length(&values) == 2, 0);
        assert!(vector::borrow(&values, 0).value == 0, 1);
        assert!(vector::borrow(&values, 1).value == 1, 2);
        drop(table);
    }
    
    #[test]
    fun test_index_table_get_latest(){
        let table = new();
        upsert(&mut table, 0, TestValue { value: 0 });
        upsert(&mut table, 1, TestValue { value: 1 });
        upsert(&mut table, 4, TestValue { value: 4 });
       
        let values = get_latest(&table, 2);
        assert!(vector::length(&values) == 2, 0);
        assert!(vector::borrow(&values, 0).value == 4, 1);
        assert!(vector::borrow(&values, 1).value == 1, 2);
        drop(table);
    }
    
    
}