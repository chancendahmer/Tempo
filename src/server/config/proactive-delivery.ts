type DeliveryConfiguration = {
  INTERVENTION_SHADOW_MODE: boolean;
  AUTONOMOUS_SENDING_ENABLED: boolean;
  PROACTIVE_CANARY_USER_IDS?: string[];
  CLEANUP_CHECKINS_ENABLED?: boolean;
};

/** Operator permission only: never replaces user consent or eligibility gates. */
export function proactiveDeliveryEnabled(config: DeliveryConfiguration, userId: string): boolean {
  return (!config.INTERVENTION_SHADOW_MODE && config.AUTONOMOUS_SENDING_ENABLED)
    || (config.PROACTIVE_CANARY_USER_IDS ?? []).includes(userId.toLowerCase());
}

/** Cleanup can be released independently of model-selected coaching. */
export function cleanupDeliveryEnabled(config: DeliveryConfiguration, userId: string): boolean {
  return config.CLEANUP_CHECKINS_ENABLED === true || proactiveDeliveryEnabled(config, userId);
}
