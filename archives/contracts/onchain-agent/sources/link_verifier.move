module nuwa_framework::link_verifier {

    //TODO design a CredentialVerifier Object to manage verifiers
    /// Check if an address is a verifier
    public fun is_verifier(verifier_addr: address): bool {
        verifier_addr == @nuwa_framework
    }
    
}