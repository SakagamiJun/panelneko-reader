package crypto

import (
	"strings"
	"testing"
)

func TestEncryptDecryptWithMachineID(t *testing.T) {
	machineID := "test-hardware-uuid-12345"
	username := "sakagami"
	original := "SecretPassword@2026!"

	encrypted, err := EncryptPassword(original, machineID, username)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	if encrypted == original || strings.Contains(encrypted, original) {
		t.Fatalf("ciphertext should not contain plaintext")
	}

	decrypted, err := DecryptPassword(encrypted, machineID, username)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}

	if decrypted != original {
		t.Fatalf("expected %q, got %q", original, decrypted)
	}
}

func TestEncryptDecryptWithUsernameFallback(t *testing.T) {
	// Empty machineID triggers username fallback
	machineID := ""
	username := "sakagami"
	original := "FallbackPassword#456"

	encrypted, err := EncryptPassword(original, machineID, username)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	decrypted, err := DecryptPassword(encrypted, machineID, username)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}

	if decrypted != original {
		t.Fatalf("expected %q, got %q", original, decrypted)
	}

	// Adversarial: Cross-username decryption should fail because key differs
	_, err = DecryptPassword(encrypted, machineID, "different_user")
	if err == nil {
		t.Fatalf("expected decryption failure with different username fallback")
	}
}
