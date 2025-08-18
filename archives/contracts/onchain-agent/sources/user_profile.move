module nuwa_framework::user_profile {
    use std::string::{Self, String};
    use std::vector;
    use std::option::{Self, Option};
    use moveos_std::object::{Self, Object, ObjectID};
    use moveos_std::event;
    use moveos_std::signer;
    use moveos_std::timestamp;
    
    use nuwa_framework::name_registry;
    use nuwa_framework::link_verifier;
    use nuwa_framework::user_input_validator::{validate_name};

    friend nuwa_framework::agent;

    /// Error codes
    const ErrorInvalidLinkType: u64 = 1;
    const ErrorInvalidLinkUrl: u64 = 2;
    const ErrorLinkNotFound: u64 = 3;
    const ErrorTooManyLinks: u64 = 4;
    const ErrorInvalidVerifier: u64 = 5;
    const ErrorInvalidCredential: u64 = 6;
    const ErrorAlreadyVerified: u64 = 7;
    const ErrorUsernameNotRegistered: u64 = 8;
    const ErrorLinkNotVerified: u64 = 9;
    const ErrorLinkAlreadyExists: u64 = 10;

    /// Maximum number of links a user can have
    const MAX_LINKS: u64 = 10;
    public fun max_links(): u64 {
        MAX_LINKS
    }

    /// Supported link types
    const LINK_TYPE_WEBSITE: u8 = 0;
    public fun link_type_website(): u8 {    
        LINK_TYPE_WEBSITE
    }

    const LINK_TYPE_TWITTER: u8 = 1;
    public fun link_type_twitter(): u8 {
        LINK_TYPE_TWITTER
    }

    const LINK_TYPE_GITHUB: u8 = 2;
    public fun link_type_github(): u8 {
        LINK_TYPE_GITHUB
    }

    const LINK_TYPE_TELEGRAM: u8 = 3;
    public fun link_type_telegram(): u8 {
        LINK_TYPE_TELEGRAM
    }

    const LINK_TYPE_DISCORD: u8 = 4;
    public fun link_type_discord(): u8 {
        LINK_TYPE_DISCORD
    }

    const LINK_TYPE_LENS: u8 = 5;
    public fun link_type_lens(): u8 {
        LINK_TYPE_LENS
    }

    const LINK_TYPE_ENS: u8 = 6;
    public fun link_type_ens(): u8 {
        LINK_TYPE_ENS
    }

    /// URL patterns for different link types
    const URL_PATTERN_TWITTER_1: vector<u8> = b"twitter.com";
    const URL_PATTERN_TWITTER_2: vector<u8> = b"x.com";
    const URL_PATTERN_GITHUB: vector<u8> = b"github.com";
    const URL_PATTERN_TELEGRAM: vector<u8> = b"t.me";
    const URL_PATTERN_DISCORD: vector<u8> = b"discord.com";
    const URL_PATTERN_LENS: vector<u8> = b"lens.xyz";
    const URL_PATTERN_ENS: vector<u8> = b"ens.domains";

    /// Structure to represent a verification credential
    struct VerificationCredential has copy, drop, store {
        /// The address of the verifier
        verifier: address,
        /// The timestamp when the verification was issued
        issued_at: u64,
        /// The signature of the verification (can be used to verify the credential)
        signature: vector<u8>,
    }

    /// Structure to represent a social link
    struct SocialLink has copy, drop, store {
        link_type: u8,
        url: String,
        /// The summary of the link
        summary: String,
        /// The verification credential if the link is verified
        credential: Option<VerificationCredential>,
    }

    /// Events
    struct LinkAddedEvent has drop, copy, store {
        addr: address,
        link: SocialLink,
    }

    struct LinkRemovedEvent has drop, copy, store {
        addr: address,
        link_type: u8,
    }

    struct LinkVerifiedEvent has drop, copy, store {
        addr: address,
        link_type: u8,
        verifier: address,
    }

    struct LinkVerificationRevokedEvent has drop, copy, store {
        addr: address,
        link_type: u8,
    }

    /// User profile
    /// The Object<UserProfile> has no `store` ability, so it can't be transferred
    struct UserProfile has key {
        /// The display name of the user
        name: String,
        /// The username of the user
        username: String,
        /// The avatar of the user
        avatar: String,
        /// User's social links
        links: vector<SocialLink>,
    }

    /// Initialize a new user profile
    public entry fun init_profile(
        caller: &signer,
        name: String,
        username: String,
        avatar: String,
    ) {
        // Verify that the username is registered in name_registry
        let caller_addr = signer::address_of(caller);
        name_registry::register_username(caller, username);
        validate_name(&name);
        init_profile_internal(caller_addr, name, username, avatar);
    }

    public(friend) fun init_profile_internal(
        caller_addr: address,
        name: String,
        username: String,
        avatar: String,
    ) {
        let profile = UserProfile {
            name,
            username,
            avatar,
            links: vector::empty(),
        };
        
        let profile_obj = object::new_account_named_object(caller_addr, profile);
        object::transfer_extend(profile_obj, caller_addr);
    }

    public fun exists_profile(addr: address): bool {
        let profile_obj_id = object::account_named_object_id<UserProfile>(addr);
        object::exists_object(profile_obj_id)
    }

    // ============= Profile Getters =============

    public fun get_profile(addr: address): &UserProfile {
        let profile_obj_id = object::account_named_object_id<UserProfile>(addr);
        let profile_obj = object::borrow_object<UserProfile>(profile_obj_id);
        object::borrow(profile_obj)
    }

    public fun profile_name(profile: &UserProfile): &String {
        &profile.name
    }

    public fun profile_username(profile: &UserProfile): &String {
        &profile.username
    }

    public fun profile_avatar(profile: &UserProfile): &String {
        &profile.avatar
    }

    public fun profile_links(profile: &UserProfile): &vector<SocialLink> {
        &profile.links
    }

    public fun social_link_url(link: &SocialLink): &String {
        &link.url
    }

    public fun social_link_type(link: &SocialLink): u8 {
        link.link_type
    }

    public fun social_link_summary(link: &SocialLink): &String {
        &link.summary
    }

    public fun social_link_is_verified(link: &SocialLink): bool {
        option::is_some(&link.credential)
    }

    public fun social_link_credential(link: &SocialLink): &Option<VerificationCredential> {
        &link.credential
    }

    public fun credential_verifier(credential: &VerificationCredential): &address {
        &credential.verifier
    }

    public fun credential_issued_at(credential: &VerificationCredential): &u64 {
        &credential.issued_at
    }

    public fun credential_signature(credential: &VerificationCredential): &vector<u8> {
        &credential.signature
    }

    // =================================

    public fun borrow_mut_profile(caller: &signer): &mut Object<UserProfile> {
        let caller_addr = signer::address_of(caller);
        let profile_obj_id = object::account_named_object_id<UserProfile>(caller_addr);
        borrow_mut_profile_by_id(profile_obj_id)
    }

    fun borrow_mut_profile_by_id(profile_obj_id: ObjectID): &mut Object<UserProfile> {
        object::borrow_mut_object_extend<UserProfile>(profile_obj_id)
    }

    // Helper function to check if URL contains a pattern
    fun contains_pattern(url_bytes: &vector<u8>, pattern: &vector<u8>): bool {
        let url_len = vector::length(url_bytes);
        let pattern_len = vector::length(pattern);
        if (url_len < pattern_len) return false;
        
        let i = 0;
        while (i <= url_len - pattern_len) {
            let matched = true;
            let j = 0;
            while (j < pattern_len) {
                if (*vector::borrow(url_bytes, i + j) != *vector::borrow(pattern, j)) {
                    matched = false;
                    break
                };
                j = j + 1;
            };
            if (matched) return true;
            i = i + 1;
        };
        false
    }

    /// Determine link type from URL
    fun determine_link_type(url: &String): u8 {
        let url_bytes = string::bytes(url);
        
        // Check URL patterns
        if (contains_pattern(url_bytes, &URL_PATTERN_TWITTER_1) || contains_pattern(url_bytes, &URL_PATTERN_TWITTER_2)) {
            LINK_TYPE_TWITTER
        } else if (contains_pattern(url_bytes, &URL_PATTERN_GITHUB)) {
            LINK_TYPE_GITHUB
        } else if (contains_pattern(url_bytes, &URL_PATTERN_TELEGRAM)) {
            LINK_TYPE_TELEGRAM
        } else if (contains_pattern(url_bytes, &URL_PATTERN_DISCORD)) {
            LINK_TYPE_DISCORD
        } else if (contains_pattern(url_bytes, &URL_PATTERN_LENS)) {
            LINK_TYPE_LENS
        } else if (contains_pattern(url_bytes, &URL_PATTERN_ENS)) {
            LINK_TYPE_ENS
        } else {
            LINK_TYPE_WEBSITE
        }
    }

    /// Add a social link to the user's profile
    public entry fun add_social_link(profile_obj: &mut Object<UserProfile>, url: String) {
        let owner = object::owner(profile_obj);
        let profile = object::borrow_mut(profile_obj);
        
        // Determine link type from URL
        let link_type = determine_link_type(&url);
        
        // Check if we've reached the maximum number of links
        assert!(vector::length(&profile.links) < MAX_LINKS, ErrorTooManyLinks);

        // Check if link type already exists
        let i = 0;
        let len = vector::length(&profile.links);
        while (i < len) {
            let existing_link = vector::borrow(&profile.links, i);
            if (existing_link.link_type == link_type) {
                if (link_type == LINK_TYPE_WEBSITE) {
                    // Website links types can be added multiple times, but the url must be different
                    assert!(existing_link.url != url, ErrorLinkAlreadyExists);
                } else {
                    abort ErrorLinkAlreadyExists
                };
            };
            i = i + 1;
        };

        // Create new link
        let link = SocialLink {
            link_type,
            url,
            summary: string::utf8(b""),
            credential: option::none(),
        };

        // Add link to profile
        vector::push_back(&mut profile.links, link);

        // Emit event
        event::emit(LinkAddedEvent {
            addr: owner,
            link,
        });
    }

    /// Update the user's profile name
    public entry fun update_user_profile_name(  
        profile_obj: &mut Object<UserProfile>,
        name: String,
    ) {
        validate_name(&name);
        let profile = object::borrow_mut(profile_obj);
        profile.name = name;
    }

    /// Update the user's profile avatar
    public entry fun update_user_profile_avatar(
        profile_obj: &mut Object<UserProfile>,
        avatar: String,
    ) {
        let profile = object::borrow_mut(profile_obj);
        profile.avatar = avatar;
    }

    /// Verify a social link with a credential
    public entry fun verify_link(
        verifier: &signer,
        profile_obj_id: ObjectID,
        link_type: u8,
        signature: vector<u8>,
    ) {
        //TODO validate signature

        let verifier_addr = signer::address_of(verifier);
        assert!(link_verifier::is_verifier(verifier_addr), ErrorInvalidVerifier);
        let profile_obj = borrow_mut_profile_by_id(profile_obj_id);
        verify_link_internal(verifier_addr, profile_obj, link_type, signature);
    }

    fun verify_link_internal(
        verifier_addr: address,
        profile_obj: &mut Object<UserProfile>,
        link_type: u8,
        signature: vector<u8>,
    ) {
        let owner = object::owner(profile_obj); 
        let profile = object::borrow_mut(profile_obj);
        let links = &mut profile.links;
        let i = 0;
        let len = vector::length(links);
         
        while (i < len) {
            let link = vector::borrow_mut(links, i);
            if (link.link_type == link_type) {
                // Check if link is already verified
                assert!(option::is_none(&link.credential), ErrorAlreadyVerified);
                
                // Update link verification status
                link.credential = option::some(VerificationCredential {
                    verifier: verifier_addr,
                    issued_at: timestamp::now_milliseconds(),
                    signature: signature,
                });
                
                // Emit event
                event::emit(LinkVerifiedEvent {
                    addr: owner,
                    link_type,
                    verifier: verifier_addr,
                });
                return
            };
            i = i + 1;
        };
        
        abort ErrorLinkNotFound
    }

    /// Update the summary of a social link, only allows the verifier to update the summary of a verified link
    public entry fun update_link_summary(
        verifier: &signer,
        profile_obj_id: ObjectID,
        link_type: u8,
        summary: String,
    ) {
        let verifier_addr = signer::address_of(verifier);
        let profile_obj = borrow_mut_profile_by_id(profile_obj_id);
        update_link_summary_internal(verifier_addr, profile_obj, link_type, summary);
    }

    fun update_link_summary_internal(
        verifier_addr: address,
        profile_obj: &mut Object<UserProfile>,
        link_type: u8,
        summary: String,
    ) {
        let profile = object::borrow_mut(profile_obj);
        let links = &mut profile.links;
        let i = 0;
        let len = vector::length(links);

        while (i < len) {
            let link = vector::borrow_mut(links, i);
            if (link.link_type == link_type) {
                assert!(option::is_some(&link.credential), ErrorLinkNotVerified);
                let credential = option::borrow(&link.credential);
                assert!(credential.verifier == verifier_addr, ErrorInvalidVerifier);
                link.summary = summary;
                return
            };
            i = i + 1;
        };

        abort ErrorLinkNotFound
    }

    /// Revoke a link verification
    public entry fun revoke_link_verification(
        verifier: &signer,
        profile_obj_id: ObjectID,
        link_type: u8,
    ) { 
        let verifier_addr = signer::address_of(verifier);
        let profile_obj = borrow_mut_profile_by_id(profile_obj_id);
        revoke_link_verification_internal(verifier_addr, profile_obj, link_type);
    }

    fun revoke_link_verification_internal(
        verifier_addr: address,
        profile_obj: &mut Object<UserProfile>,
        link_type: u8,
    ) {
        let owner = object::owner(profile_obj);
        let profile = object::borrow_mut(profile_obj);
        let links = &mut profile.links;
        let i = 0;
        let len = vector::length(links);
        
        while (i < len) {
            let link = vector::borrow_mut(links, i);
            if (link.link_type == link_type) {
                assert!(option::is_some(&link.credential), ErrorLinkNotVerified);
                let credential = option::borrow(&link.credential);
                assert!(credential.verifier == verifier_addr, ErrorInvalidVerifier);

                link.credential = option::none();
                
                // Emit event
                event::emit(LinkVerificationRevokedEvent {
                    addr: owner,
                    link_type,
                });
                return
            };
            i = i + 1;
        };
        
        abort ErrorLinkNotFound
    }

    /// Remove a social link from the user's profile
    public entry fun remove_social_link(profile_obj: &mut Object<UserProfile>, link_type: u8) {
        let owner = object::owner(profile_obj);
        let profile = object::borrow_mut(profile_obj);
        let links = &mut profile.links;
        let i = 0;
        let len = vector::length(links);
        
        while (i < len) {
            let link = vector::borrow(links, i);
            if (link.link_type == link_type) {
                vector::remove(links, i);
                event::emit(LinkRemovedEvent {
                    addr: owner,
                    link_type,
                });
                return
            };
            i = i + 1;
        };
        
        abort ErrorLinkNotFound
    }

    /// Get all social links for a user
    public fun get_social_links(profile_obj: &Object<UserProfile>): &vector<SocialLink> {
        let profile = object::borrow(profile_obj);
        &profile.links
    }

    /// Get a specific social link by type
    public fun get_social_link_by_type(profile_obj: &Object<UserProfile>, link_type: u8): Option<SocialLink> {
        let profile = object::borrow(profile_obj);
        let links = &profile.links;
        let i = 0;
        let len = vector::length(links);
        
        while (i < len) {
            let link = vector::borrow(links, i);
            if (link.link_type == link_type) {
                return option::some(*link)
            };
            i = i + 1;
        };
        
        option::none()
    }

    /// Check if a user has a specific type of social link
    public fun has_social_link(profile_obj: &Object<UserProfile>, link_type: u8): bool {
        option::is_some(&get_social_link_by_type(profile_obj, link_type))
    }

    /// Get the verification credential for a link
    public fun get_link_credential(profile_obj: &Object<UserProfile>, link_type: u8): Option<VerificationCredential> {
        let link_opt = get_social_link_by_type(profile_obj, link_type);
        if (option::is_some(&link_opt)) {
            let link = option::borrow(&link_opt);
            link.credential
        } else {
            option::none()
        }
    }

}