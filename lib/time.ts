/**
 * The platform runs on Pakistan time. Server components format dates in the
 * host's zone (UTC on Vercel), so anything that shows a date or time must name
 * the zone explicitly or it comes out five hours behind.
 */
export const APP_TIME_ZONE = "Asia/Karachi";
