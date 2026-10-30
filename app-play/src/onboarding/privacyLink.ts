import { Linking } from 'react-native';
import { PRIVACY_POLICY_URL } from './privacy.ts';

/** Open directly; Android package visibility can make canOpenURL return false for valid browser handlers. */
export async function openPrivacyPolicy(): Promise<boolean> {
  try { await Linking.openURL(PRIVACY_POLICY_URL); return true; }
  catch { return false; }
}
