import { useTranslation } from 'react-i18next';

export interface PasskeyErrorInfo {
  title: string;
  description: string;
  actionLabel?: string;
  actionType?: 'retry' | 'refresh' | 'learnMore';
  showTechnicalDetails?: boolean;
}

export class PasskeyErrorHandler {
  private t: (key: string) => string;

  constructor(t: (key: string) => string) {
    this.t = t;
  }

  /**
   * Parse WebAuthn error and return user-friendly error information
   */
  public parseError(error: unknown): PasskeyErrorInfo {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : '';

    // Handle specific WebAuthn error types
    if (this.isUserCancelledError(error)) {
      return {
        title: this.t('passkey.errors.userCancelled'),
        description: this.t('passkey.errors.userCancelledDescription'),
        actionLabel: this.t('passkey.retry'),
        actionType: 'retry',
      };
    }

    if (this.isTimeoutError(error)) {
      return {
        title: this.t('passkey.errors.timeout'),
        description: this.t('passkey.errors.timeoutDescription'),
        actionLabel: this.t('passkey.retry'),
        actionType: 'retry',
      };
    }

    if (this.isNotAllowedError(error)) {
      return {
        title: this.t('passkey.errors.notAllowed'),
        description: this.t('passkey.errors.notAllowedDescription'),
        actionLabel: this.t('passkey.refreshPage'),
        actionType: 'refresh',
      };
    }

    if (this.isUnsupportedError(error)) {
      return {
        title: this.t('passkey.errors.unsupported'),
        description: this.t('passkey.errors.unsupportedDescription'),
        actionLabel: this.t('passkey.learnMore'),
        actionType: 'learnMore',
      };
    }

    if (this.isAlreadyExistsError(error)) {
      return {
        title: this.t('passkey.errors.alreadyExists'),
        description: this.t('passkey.errors.alreadyExistsDescription'),
        actionLabel: this.t('passkey.refreshPage'),
        actionType: 'refresh',
      };
    }

    // Generic error fallback
    return {
      title: this.t('passkey.errors.generic'),
      description: this.t('passkey.errors.genericDescription'),
      actionLabel: this.t('passkey.retry'),
      actionType: 'retry',
      showTechnicalDetails: true,
    };
  }

  /**
   * Check if error is user cancellation
   */
  private isUserCancelledError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    return (
      name === 'notallowederror' ||
      name === 'aborterror' ||
      message.includes('user cancelled') ||
      message.includes('user canceled') ||
      message.includes('operation cancelled') ||
      message.includes('operation canceled') ||
      message.includes('user verification cancelled') ||
      message.includes('user verification canceled') ||
      message.includes('the user cancelled') ||
      message.includes('the user canceled')
    );
  }

  /**
   * Check if error is timeout
   */
  private isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    return (
      name === 'timeouterror' ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('operation timed out')
    );
  }

  /**
   * Check if error is "not allowed" due to security restrictions
   */
  private isNotAllowedError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // This specific case mentioned in the issue - Chrome double-dialog cancellation
    const isChromeDoubleDialogError =
      message.includes('the operation either timed out or was not allowed') &&
      message.includes('privacy-considerations-client');

    // Generic NotAllowedError that's not user cancellation
    const isGenericNotAllowed = name === 'notallowederror' && !this.isUserCancelledError(error);

    return (
      isChromeDoubleDialogError ||
      isGenericNotAllowed ||
      message.includes('not allowed') ||
      message.includes('security restrictions') ||
      message.includes('privacy considerations') ||
      message.includes('operation not allowed')
    );
  }

  /**
   * Check if error is due to unsupported device/browser
   */
  private isUnsupportedError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    return (
      name === 'notsupportederror' ||
      message.includes('not supported') ||
      message.includes('unsupported') ||
      message.includes('webauthn not available') ||
      message.includes('publickeycredential not supported')
    );
  }

  /**
   * Check if error is due to credential already existing
   */
  private isAlreadyExistsError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    return (
      message.includes('already been registered') ||
      message.includes('credential already exists') ||
      message.includes('passkey has already been registered') ||
      message.includes('already registered in this session')
    );
  }
}

/**
 * React hook for using PasskeyErrorHandler
 */
export function usePasskeyErrorHandler() {
  const { t } = useTranslation();

  return new PasskeyErrorHandler(t);
}

/**
 * Utility function to get error info without React context
 */
export function getPasskeyErrorInfo(error: unknown, t: (key: string) => string): PasskeyErrorInfo {
  const handler = new PasskeyErrorHandler(t);
  return handler.parseError(error);
}
