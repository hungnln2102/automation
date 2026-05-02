export const APP_NOTIFICATION_EVENT = "app-notification";

export type AppNotificationPayload = {
  type?: "success" | "error" | "info";
  title?: string;
  message?: string;
};

export function showAppNotification(payload: AppNotificationPayload) {
  window.dispatchEvent(
    new CustomEvent<AppNotificationPayload>(APP_NOTIFICATION_EVENT, {
      detail: payload,
    })
  );
}
