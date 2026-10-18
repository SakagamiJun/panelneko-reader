package crypto

import (
	"strings"
	"testing"
)

func TestMachineIDExtraction(t *testing.T) {
	id := GetMachineID()
	// On macOS running machine, ioreg should typically find IOPlatformUUID
	t.Logf("Detected machine ID: %q", id)
}

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

	// Cross-username decryption should fail because key differs
	_, err = DecryptPassword(encrypted, machineID, "different_user")
	if err == nil {
		t.Fatalf("expected decryption failure with different username fallback")
	}
}

func TestKeyFingerprint(t *testing.T) {
	src1, fp1 := GetKeyFingerprint("machine-id-xyz", "user1")
	if src1 != "machine_id" || fp1 == "" {
		t.Errorf("unexpected src1: %s, fp1: %s", src1, fp1)
	}

	src2, fp2 := GetKeyFingerprint("", "user1")
	if src2 != "username_fallback" || fp2 == "" {
		t.Errorf("unexpected src2: %s, fp2: %s", src2, fp2)
	}
}
