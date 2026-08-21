// Wire types mirroring statsapi.mlb.com JSON shapes. Only fields this app reads are modeled.

export interface ScheduleResponse {
  dates: { date: string; games: ScheduleGame[] }[]
}

export interface ScheduleGame {
  gamePk: number
  gameDate: string
  status: GameStatus
  teams: {
    home: ScheduleTeamSide
    away: ScheduleTeamSide
  }
  venue: { id: number; name: string }
}

export interface ScheduleTeamSide {
  team: { id: number; name: string }
  score?: number
  isWinner?: boolean
  leagueRecord?: { wins: number; losses: number; ties: number; pct: string }
}

export interface GameStatus {
  abstractGameState: 'Preview' | 'Live' | 'Final'
  detailedState: string
  codedGameState?: string
  statusCode?: string
}

export interface GameFeed {
  gameData: GameData
  liveData: LiveData
}

export interface GameData {
  teams: {
    home: TeamInfo
    away: TeamInfo
  }
  players: Record<string, Person>
  venue: { id: number; name: string }
  status: GameStatus
  datetime: { dateTime: string }
}

export interface TeamInfo {
  id: number
  name: string
  abbreviation: string
  teamName: string
}

export interface Person {
  id: number
  fullName: string
  primaryPosition?: { code: string; name: string; abbreviation: string }
  batSide?: { code: string }
  pitchHand?: { code: string }
}

export interface LiveData {
  plays: {
    allPlays: Play[]
    currentPlay?: Play
  }
  linescore: Linescore
  boxscore: Boxscore
}

export interface Play {
  about: {
    atBatIndex: number
    halfInning: 'top' | 'bottom'
    inning: number
    isComplete: boolean
    isScoringPlay: boolean
  }
  result: {
    type: string
    event?: string
    eventType?: string
    description?: string
    rbi?: number
    awayScore: number
    homeScore: number
  }
  count: { balls: number; strikes: number; outs: number }
  matchup: {
    batter: { id: number; fullName?: string }
    pitcher: { id: number; fullName?: string }
    batSide?: { code: string }
    pitchHand?: { code: string }
  }
  runners: RunnerMovement[]
  playEvents: PlayEvent[]
}

export interface RunnerMovement {
  movement: {
    start: string | null
    end: string | null
    outBase: string | null
    isOut: boolean
    outNumber?: number | null
  }
  details: {
    event?: string
    eventType?: string
    runner: { id: number; fullName?: string }
    isScoringEvent: boolean
  }
  credits?: { position: { code: string }; credit: string }[]
}

export interface PlayEvent {
  isPitch: boolean
  index: number
  type: string
  details: {
    call?: { code: string; description: string }
    description?: string
    event?: string
    eventType?: string
    isInPlay?: boolean
    isStrike?: boolean
    isBall?: boolean
    isOut?: boolean
  }
  pitchData?: {
    startSpeed: number
    coordinates?: Record<string, number>
  }
  hitData?: {
    launchSpeed?: number
    launchAngle?: number
    totalDistance?: number
    trajectory?: string
    coordinates?: { coordX: number; coordY: number }
  }
}

export interface Linescore {
  innings: { num: number; home?: { runs?: number }; away?: { runs?: number } }[]
  teams: {
    home: { runs: number; hits: number; errors: number }
    away: { runs: number; hits: number; errors: number }
  }
  balls: number
  strikes: number
  outs: number
  offense: {
    batter?: PlayerRef
    onDeck?: PlayerRef
    inHole?: PlayerRef
    first?: PlayerRef
    second?: PlayerRef
    third?: PlayerRef
  }
  defense: {
    pitcher?: PlayerRef
    catcher?: PlayerRef
  }
}

export interface PlayerRef {
  id: number
  fullName: string
}

export interface Boxscore {
  teams: {
    home: BoxscoreTeam
    away: BoxscoreTeam
  }
}

export interface BoxscoreTeam {
  team: { id: number; name: string }
  players: Record<string, BoxscorePlayer>
  battingOrder?: number[]
}

export interface BoxscorePlayer {
  person: { id: number; fullName: string }
  position?: { code: string; abbreviation: string }
  /** Lineup spot as "N00" (e.g. "300" = batting 3rd); the trailing digits track in-game substitutions. */
  battingOrder?: string
  stats: {
    batting?: BattingStats
    pitching?: PitchingStats
  }
  seasonStats: {
    batting?: BattingStats
    pitching?: PitchingStats
  }
}

export interface BattingStats {
  atBats?: number
  hits?: number
  homeRuns?: number
  rbi?: number
  runs?: number
  avg?: string
  obp?: string
  slg?: string
}

export interface PitchingStats {
  inningsPitched?: string
  strikeOuts?: number
  baseOnBalls?: number
  earnedRuns?: number
  pitchesThrown?: number
  era?: string
  whip?: string
}
