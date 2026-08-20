export const MLB_API_BASE = 'https://statsapi.mlb.com'

export const DEFAULT_LIVE_POLL_INTERVAL_MS = 8000
export const MIN_POLL_INTERVAL_MS = 2000
export const MAX_POLL_INTERVAL_MS = 30000

export const DEFAULT_REPLAY_REVEAL_INTERVAL_MS = 1500
export const MIN_REPLAY_INTERVAL_MS = 200
export const MAX_REPLAY_INTERVAL_MS = 8000

export const RECENT_GAMES_LOOKBACK_DAYS = 3

/** Native pixel dimensions of public/assets/stadium.webp */
export const STADIUM_IMAGE_WIDTH = 1448
export const STADIUM_IMAGE_HEIGHT = 1086

/** Pixel anchor points within the stadium image, as measured against its native dimensions. */
export const STADIUM_BASE_ANCHORS_PX = {
  home: { x: 723, y: 962 },
  first: { x: 1006, y: 722 },
  second: { x: 724, y: 542 },
  third: { x: 441, y: 720 },
  mound: { x: 724, y: 721 },
} as const

/**
 * The outfield wall as drawn in the stadium art — a curved backdrop (with stands behind it), not
 * a flat line. Used to clamp hit-ball/outfielder placement to stay in front of it.
 */
export const STADIUM_WALL_ANCHORS_PX = {
  leftCorner: { x: 21, y: 250 },
  center: { x: 726, y: 64 },
  rightCorner: { x: 1424, y: 250 },
} as const

export const SETTINGS_STORAGE_KEY = 'mlb-sim:settings'

// import.meta.env.BASE_URL (not a hardcoded leading slash) so these still resolve correctly when
// the app is deployed under a subpath, e.g. GitHub Pages' /live-mlb-simulation/.
export const STADIUM_IMAGE_URL = `${import.meta.env.BASE_URL}assets/stadium.webp`
export const BASEBALL_ICON_URL = `${import.meta.env.BASE_URL}assets/baseball.svg`
