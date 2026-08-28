import { apiRequest } from "@/lib/api-client";

const BASE_PATH = "/v1/push";

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function getVapidPublicKey(token: string): Promise<{ publicKey: string }> {
  return apiRequest(`${BASE_PATH}/vapid-public-key`, { token });
}

export function subscribePush(token: string, subscription: PushSubscriptionPayload): Promise<void> {
  return apiRequest(`${BASE_PATH}/subscribe`, {
    method: "POST",
    token,
    body: subscription,
  });
}

export function unsubscribePush(token: string, endpoint: string): Promise<void> {
  return apiRequest(`${BASE_PATH}/unsubscribe`, { method: "POST", token, body: { endpoint } });
}
