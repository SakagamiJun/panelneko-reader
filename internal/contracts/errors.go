package contracts

type ErrorCode string

const (
	ErrCodeStoreFailure     ErrorCode = "STORE_FAILURE"
	ErrCodeSettingsInvalid  ErrorCode = "SETTINGS_INVALID"
	ErrCodeBootstrapFailure ErrorCode = "BOOTSTRAP_FAILURE"
)

type ContractError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
}

func (e ContractError) Error() string {
	if e.Message != "" {
		return string(e.Code) + ": " + e.Message
	}

	return string(e.Code)
}
