# Passkey Error Handling

This module provides enhanced error handling for WebAuthn/Passkey operations, specifically addressing common user experience issues like the Chrome browser double-dialog problem mentioned in the W3C WebAuthn privacy considerations.

## Features

- **User-friendly error messages**: Converts technical WebAuthn errors into readable explanations
- **Internationalization support**: Error messages available in multiple languages
- **Contextual actions**: Provides appropriate action buttons (retry, refresh, learn more) based on error type
- **Chrome-specific handling**: Special handling for the "operation either timed out or was not allowed" error that occurs after multiple user cancellations

## Usage

### In Components with React Hooks

```tsx
import { usePasskeyErrorHandler } from '@/lib/passkey/PasskeyErrorHandler';

function MyComponent() {
  const errorHandler = usePasskeyErrorHandler();

  try {
    // Your passkey operation
  } catch (error) {
    const errorInfo = errorHandler.parseError(error);
    // Use errorInfo.title, errorInfo.description, etc.
  }
}
```

### Without React Context

```tsx
import { getPasskeyErrorInfo } from '@/lib/passkey/PasskeyErrorHandler';
import { useTranslation } from 'react-i18next';

function handleError(error: unknown) {
  const { t } = useTranslation();
  const errorInfo = getPasskeyErrorInfo(error, t);
  // Use errorInfo
}
```

## Error Types Handled

1. **User Cancellation**: User clicked cancel on the passkey prompt
2. **Timeout**: Operation timed out
3. **Not Allowed**: Security policy restrictions (including the Chrome double-dialog case)
4. **Unsupported**: Device/browser doesn't support passkeys
5. **Already Exists**: Credential already registered
6. **Generic**: Fallback for other errors

## Chrome Double-Dialog Issue

The specific error mentioned in the GitHub issue:

> "The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client"

This error occurs when:

1. User cancels the first passkey dialog
2. Chrome shows a second passkey selection dialog
3. User cancels again
4. Chrome blocks further passkey operations temporarily

Our solution provides a clear explanation and suggests refreshing the page to reset the browser state.

## Architecture

### Separation of Concerns

1. **PasskeyService**: Pure business logic layer

   - Handles WebAuthn API calls
   - Re-throws original errors without modification
   - No internationalization or UI concerns

2. **PasskeyErrorHandler**: Error processing layer

   - Converts technical errors to user-friendly messages
   - Handles internationalization
   - Provides contextual actions

3. **UI Components**: Presentation layer
   - Uses PasskeyErrorHandler to parse errors
   - Displays appropriate UI based on error type
   - Handles user actions (retry, refresh, etc.)

### Why This Architecture?

- **Language Independence**: PasskeyService remains language-agnostic
- **Consistent Error Handling**: All WebAuthn errors processed through the same handler
- **Easy Testing**: Business logic separated from UI concerns
- **Maintainability**: Single source of truth for error messages

## Integration Examples

### Correct Usage in Components

```tsx
// ✅ Good: UI layer handles error parsing
try {
  await passkeyService.ensureUser();
} catch (error) {
  const errorInfo = errorHandler.parseError(error);
  setError(errorInfo.description);
  setErrorInfo(errorInfo);
}
```

### Incorrect Usage

```tsx
// ❌ Bad: Service layer hardcodes error messages
// PasskeyService should NOT do this:
throw new Error('用户取消了 Passkey 创建操作...');
```
