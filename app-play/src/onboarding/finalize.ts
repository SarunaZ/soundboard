import { hasCompletedOnboarding, type OnboardingStorage } from './storage.ts';

export interface OnboardingAnalyticsAuthority {
  initializeProductAnalytics(): Promise<void>;
  setAnalyticsConsent(enabled: boolean): Promise<void>;
  getAnalyticsStatus(): { consent: 'unknown' | 'off' | 'on'; enabled: boolean };
}

export type OnboardingFinishResult = {
  completed: boolean;
  consent: 'off' | 'on';
  sharingUnavailable: boolean;
  completionSaved: boolean;
  message: string;
};

export interface OnboardingDependencies {
  storage: OnboardingStorage;
  analytics: OnboardingAnalyticsAuthority;
}

/** A single serialized authority for explicit onboarding choices. */
export class OnboardingCoordinator {
  private operation: Promise<OnboardingFinishResult> | null = null;
  private readonly deps: OnboardingDependencies;
  constructor(deps: OnboardingDependencies) { this.deps = deps; }

  async resolveStartup(): Promise<'welcome' | 'ready'> {
    let completed = false;
    try {
      const marker = await this.deps.storage.readCompletion();
      completed = hasCompletedOnboarding(marker);
    } catch { /* missing, corrupt or unreadable state starts onboarding */ }
    if (!completed) return 'welcome';
    // Analytics initialization is best effort; it never blocks access to the app.
    try { await this.deps.analytics.initializeProductAnalytics(); } catch { /* service remains fail closed */ }
    return 'ready';
  }

  finishOnboardingChoice(share: boolean): Promise<OnboardingFinishResult> {
    if (this.operation) return this.operation;
    const pending = this.finish(share);
    this.operation = pending;
    void pending.then(() => { if (this.operation === pending) this.operation = null; }, () => { if (this.operation === pending) this.operation = null; });
    return pending;
  }

  private async finish(share: boolean): Promise<OnboardingFinishResult> {
    // Close the gate synchronously before any completion write or consent decision.
    let message = '';
    let sharingUnavailable = false;
    let offSaved = true;
    try { await this.deps.analytics.setAnalyticsConsent(false); }
    catch { offSaved = false; message = 'Analytics remains off, but your privacy choice could not be saved on this device.'; }

    let completionSaved = false;
    try {
      await this.deps.storage.writeCompletion({ version: 1, completed: true });
      completionSaved = true;
    } catch {
      message = 'Your choice is in effect for this session, but onboarding could not be saved and may appear again after restart.';
    }

    let consent: 'off' | 'on' = 'off';
    if (share) {
      if (completionSaved && offSaved) {
        try {
          await this.deps.analytics.setAnalyticsConsent(true);
          const status = this.deps.analytics.getAnalyticsStatus();
          if (status.enabled && status.consent === 'on') consent = 'on';
          else throw new Error('Analytics did not become active.');
        } catch {
          try { await this.deps.analytics.setAnalyticsConsent(false); } catch { /* remain fail closed in memory */ }
          sharingUnavailable = true;
          message = 'Usage analytics are unavailable in this build. You can use all features with analytics off.';
        }
      } else {
        sharingUnavailable = true;
        message = offSaved ? 'Analytics remains off because onboarding could not be saved on this device.' : 'Analytics remains off because your privacy choice could not be saved on this device.';
      }
    }
    return { completed: true, consent, sharingUnavailable, completionSaved, message };
  }
}
