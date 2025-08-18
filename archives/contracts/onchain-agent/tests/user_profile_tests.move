#[test_only]
module nuwa_framework::user_profile_tests {
    use std::string;
    use std::vector;
    use std::option;
    use moveos_std::tx_context;
    use moveos_std::object;
    use moveos_std::string_utils;
    use moveos_std::signer;
    use nuwa_framework::user_profile::{Self, UserProfile};
    use nuwa_framework::test_helper;
    

    #[test]
    fun test_user_profile() {
        // Initialize test environment
        nuwa_framework::genesis::init_for_test();

        // Create test accounts
        let user_signer = test_helper::create_test_account();
        let verifier_signer = test_helper::create_test_account_with_address(@nuwa_framework);

        // Test profile initialization
        let username = string::utf8(b"testuser");
        let name = string::utf8(b"Test User");
        let avatar = string::utf8(b"https://example.com/avatar.png");
        user_profile::init_profile(&user_signer, name, username, avatar);
        let profile_obj_id = object::account_named_object_id<UserProfile>(signer::address_of(&user_signer));

        let link_type_twitter = user_profile::link_type_twitter();
        let link_type_github = user_profile::link_type_github();

        {
            // Get profile object
            
            let profile_obj = user_profile::borrow_mut_profile(&user_signer);

            // Test adding social links
            let twitter_url = string::utf8(b"https://twitter.com/testuser");
            let github_url = string::utf8(b"https://github.com/testuser");
            user_profile::add_social_link(profile_obj, twitter_url);
            user_profile::add_social_link(profile_obj, github_url);

            // Verify links were added correctly
            let links = *user_profile::get_social_links(profile_obj);
            assert!(vector::length(&links) == 2, 0);
            let twitter_link = vector::borrow(&links, 0);
            assert!(user_profile::social_link_type(twitter_link) == user_profile::link_type_twitter(), 1);
            assert!(user_profile::social_link_url(twitter_link) == &twitter_url, 2);
        };

        {
            // Test link verification
            let signature = vector::empty<u8>();
            user_profile::verify_link(&verifier_signer, profile_obj_id, link_type_twitter, signature);
            let profile_obj = object::borrow_object<UserProfile>(profile_obj_id);
            // Verify credential was added
            let credential_opt = user_profile::get_link_credential(profile_obj, link_type_twitter);
            assert!(option::is_some(&credential_opt), 3);
            let credential = option::borrow(&credential_opt);
            assert!(*user_profile::credential_verifier(credential) == signer::address_of(&verifier_signer), 4);
        };

        {
            // Test updating link summary
            let summary = string::utf8(b"Verified Twitter account");
            user_profile::update_link_summary(&verifier_signer, profile_obj_id, link_type_twitter, summary);
            
            let profile_obj = object::borrow_object<UserProfile>(profile_obj_id);
            let links = *user_profile::get_social_links(profile_obj);
            let twitter_link = vector::borrow(&links, 0);
            assert!(user_profile::social_link_summary(twitter_link) == &summary, 5);
        };

        {
            // Test revoking verification
            user_profile::revoke_link_verification(&verifier_signer, profile_obj_id, link_type_twitter);
            let profile_obj = object::borrow_object<UserProfile>(profile_obj_id);
            let credential_opt = user_profile::get_link_credential(profile_obj, link_type_twitter);
            assert!(option::is_none(&credential_opt), 6);
        };

        {
            let profile_obj = user_profile::borrow_mut_profile(&user_signer);
            // Test removing link
            user_profile::remove_social_link(profile_obj, link_type_twitter);
            let links = *user_profile::get_social_links(profile_obj);
            assert!(vector::length(&links) == 1, 7);
            let github_link = vector::borrow(&links, 0);
            assert!(user_profile::social_link_type(github_link) == link_type_github, 8);
        };
    }

    #[test]
    #[expected_failure(abort_code = user_profile::ErrorLinkAlreadyExists)]
    fun test_duplicate_link() {
        // Initialize test environment
        nuwa_framework::genesis::init_for_test();

        // Create test account
        let user = tx_context::fresh_address();
        let user_signer = test_helper::create_test_account_with_address(user);

        // Initialize profile
        let username = string::utf8(b"testuser");
        let name = string::utf8(b"Test User");
        let avatar = string::utf8(b"https://example.com/avatar.png");
        user_profile::init_profile(&user_signer, name, username, avatar);

        // Get profile object
        let profile_obj = user_profile::borrow_mut_profile(&user_signer);

        // Try to add same link type twice
        let twitter_url1 = string::utf8(b"https://twitter.com/testuser1");
        let twitter_url2 = string::utf8(b"https://twitter.com/testuser2");
        user_profile::add_social_link(profile_obj, twitter_url1);
        user_profile::add_social_link(profile_obj, twitter_url2); // This should fail
    }

    #[test]
    #[expected_failure(abort_code = user_profile::ErrorTooManyLinks)]
    fun test_max_links() {
        // Initialize test environment
        nuwa_framework::genesis::init_for_test();

        // Create test account
        let user = tx_context::fresh_address();
        let user_signer = test_helper::create_test_account_with_address(user);

        // Initialize profile
        let username = string::utf8(b"testuser");
        let name = string::utf8(b"Test User");
        let avatar = string::utf8(b"https://example.com/avatar.png");
        user_profile::init_profile(&user_signer, name, username, avatar);

        // Get profile object
        let profile_obj = user_profile::borrow_mut_profile(&user_signer);

        // Try to add more than MAX_LINKS
        let i = 0;
        while (i <= user_profile::max_links()) {
            let url = string::utf8(b"https://example");
            string::append(&mut url, string_utils::to_string_u64(i));
            string::append(&mut url, string::utf8(b".com"));
            user_profile::add_social_link(profile_obj, url);
            i = i + 1;
        };
    }

    #[test]
    #[expected_failure(abort_code = user_profile::ErrorLinkNotVerified)]
    fun test_update_unverified_link() {
        // Initialize test environment
        nuwa_framework::genesis::init_for_test();

        // Create test accounts
        let user = tx_context::fresh_address();
        let verifier = @nuwa_framework;
        let user_signer = test_helper::create_test_account_with_address(user);
        let verifier_signer = test_helper::create_test_account_with_address(verifier);

        // Initialize profile
        let username = string::utf8(b"testuser");
        let name = string::utf8(b"Test User");
        let avatar = string::utf8(b"https://example.com/avatar.png");
        user_profile::init_profile(&user_signer, name, username, avatar);

        // Get profile object
        let profile_obj_id = object::account_named_object_id<UserProfile>(user);
        let profile_obj = user_profile::borrow_mut_profile(&user_signer);

        // Add link
        let twitter_url = string::utf8(b"https://twitter.com/testuser");
        user_profile::add_social_link(profile_obj, twitter_url);

        // Try to update unverified link
        let summary = string::utf8(b"Test summary");
        user_profile::update_link_summary(&verifier_signer, profile_obj_id, user_profile::link_type_twitter(), summary);
    }
        
}