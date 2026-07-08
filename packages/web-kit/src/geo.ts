import type { ClientLocation } from '@b2b/shared';

// Navigation deeplink for a driver: opens Yandex Maps and builds a route from the
// driver's current position (~) to the destination. Uses coordinates when present,
// otherwise falls back to an address search. Yandex is the default for UZ/CIS and
// matches the app's existing Yandex integration.
export function mapsRouteUrl(loc: ClientLocation): string {
  if (loc.lat != null && loc.lng != null) {
    return `https://yandex.uz/maps/?rtext=~${loc.lat},${loc.lng}&rtt=auto`;
  }
  return `https://yandex.uz/maps/?text=${encodeURIComponent(loc.address)}`;
}
