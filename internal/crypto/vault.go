package crypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

const vaultSalt = "PanelNeko-CopyManga-Vault-Salt-2026"

// GetMachineID attempts to retrieve a stable, persistent hardware or OS identifier.
// Returns an empty string if extraction fails, allowing graceful fallback.
func GetMachineID() string {
	switch runtime.GOOS {
	case "darwin":
		out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.Contains(line, "IOPlatformUUID") {
					parts := strings.Split(line, "=")
					if len(parts) >= 2 {
						uuid := strings.Trim(strings.TrimSpace(parts[1]), "\"")
						if uuid != "" {
							return uuid
						}
					}
				}
			}
		}
	case "windows":
		out, err := exec.Command("reg", "query", `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`, "/v", "MachineGuid").Output()
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.Contains(line, "MachineGuid") {
					fields := strings.Fields(line)
					if len(fields) >= 3 {
						return fields[len(fields)-1]
					}
				}
			}
		}
	case "linux":
		if data, err := os.ReadFile("/etc/machine-id"); err == nil && len(bytes.TrimSpace(data)) > 0 {
			return string(bytes.TrimSpace(data))
		}
		if data, err := os.ReadFile("/var/lib/dbus/machine-id"); err == nil && len(bytes.TrimSpace(data)) > 0 {
			return string(bytes.TrimSpace(data))
		}
	}
	return ""
}

// DeriveKey generates a 256-bit AES key from the machine ID or falls back to the username.
func DeriveKey(machineID string, usernameFallback string) ([]byte, string) {
	var source string
	var sourceName string

	machineID = strings.TrimSpace(machineID)
	if machineID != "" {
		source = "machine:" + machineID
		sourceName = "machine_id"
	} else {
		source = "username_fallback:" + strings.TrimSpace(usernameFallback)
		sourceName = "username_fallback"
	}

	h := sha256.New()
	h.Write([]byte(vaultSalt))
	h.Write([]byte(source))
	key := h.Sum(nil)
	return key, sourceName
}

// EncryptPassword encrypts a plaintext password using AES-256-GCM.
func EncryptPassword(plaintext string, machineID string, username string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	key, _ := DeriveKey(machineID, username)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("read nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptPassword decrypts an AES-256-GCM encrypted base64 payload.
func DecryptPassword(encodedCipher string, machineID string, username string) (string, error) {
	if encodedCipher == "" {
		return "", nil
	}
	data, err := base64.StdEncoding.DecodeString(encodedCipher)
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}

	key, _ := DeriveKey(machineID, username)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher new gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("gcm open: %w", err)
	}

	return string(plaintext), nil
}

// GetKeyFingerprint returns the key source type and a masked SHA256 fingerprint for display in Developer Mode.
func GetKeyFingerprint(machineID string, usernameFallback string) (sourceName string, fingerprint string) {
	key, src := DeriveKey(machineID, usernameFallback)
	h := sha256.Sum256(key)
	hexStr := hex.EncodeToString(h[:])
	if len(hexStr) > 16 {
		hexStr = hexStr[:16] + "..."
	}
	return src, hexStr
}
