export type Access = "public" | "private" | "telegram_chat";
export type RoomGame = "voicechat" | "cs2" | "dota2" | "brawl_stars";
export type RoomGoal = "result" | "communication";

export interface User {
  id: string;
  email: string;
  displayName: string;
  points: number;
  coins: number;
  xp: number;
  level: number;
  lobbyUnlocked: boolean;
  chestOpenCount: number;
  telegram?: {
    id: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
  };
}

export interface ChestState {
  openCount: number;
  nextCost: number;
  canOpen: boolean;
  minReward: number;
  maxReward: number;
  lobbyUnlockAvailable: boolean;
}

export interface ChestOpening {
  index: number;
  cost: number;
  coinsAwarded: number;
  xpAwarded: number;
  lobbyUnlocked: boolean;
  nextCost: number;
}

export interface Room {
  id: string;
  name: string;
  access: Access;
  game: RoomGame;
  goal: RoomGoal;
  participantCount?: number;
  maxParticipants?: number;
  inviteUrl?: string;
  telegramChatId?: string;
  createdBy: string;
}

export interface Peer {
  peerId: string;
  userId?: string;
  displayName: string;
  photoUrl?: string;
  lastSeenAt: string;
}

export interface SignalMessage {
  id: string;
  fromPeerId: string;
  toPeerId: string;
  type: "offer" | "answer" | "candidate";
  payload: any;
  createdAt: string;
}

export interface VoiceConnectionDiagnostic {
  peerId: string;
  connectionState: RTCPeerConnectionState | "new";
  iceConnectionState: RTCIceConnectionState | "new";
  hasRemoteAudioTrack: boolean;
  autoplayBlocked: boolean;
  selectedCandidateType?: string;
}
