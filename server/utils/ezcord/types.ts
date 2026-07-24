export type EzcordRoomAccess = "public" | "private" | "telegram_chat";
export type EzcordRoomGame = "voicechat" | "cs2" | "dota2" | "brawl_stars";
export type EzcordRoomGoal = "result" | "communication";
export type EzcordTelegramLoginStatus = "pending" | "approved" | "consumed" | "expired";

export interface EzcordUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  points: number;
  createdAt: string;
  activityRewardLastSeenAt?: string;
  activityRewardLastAwardedAt?: string;
  telegram?: EzcordTelegramIdentity;
}

export interface EzcordTelegramIdentity {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  linkedAt: string;
}

export interface EzcordRoom {
  id: string;
  name: string;
  access: EzcordRoomAccess;
  game: EzcordRoomGame;
  goal: EzcordRoomGoal;
  inviteCode?: string;
  telegramChatId?: string;
  createdBy: string;
  createdAt: string;
  closedAt?: string;
}

export interface EzcordSession {
  id: string;
  userId: string;
  createdAt: string;
}

export interface EzcordPeer {
  roomId: string;
  peerId: string;
  userId: string;
  displayName: string;
  photoUrl?: string;
  lastSeenAt: string;
}

export interface EzcordWaitingPeer {
  roomId: string;
  peerId: string;
  userId: string;
  displayName: string;
  queuedAt: string;
}

export interface EzcordPresenceState {
  peers: EzcordPeer[];
  waiting: boolean;
  waitingCount: number;
}

export interface EzcordSignal {
  id: string;
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  type: "offer" | "answer" | "candidate";
  payload: any;
  createdAt: string;
}

export interface EzcordKickedPeer {
  roomId: string;
  userId: string;
  kickedBy: string;
  kickedAt: string;
}

export interface EzcordTelegramLoginRequest {
  id: string;
  status: EzcordTelegramLoginStatus;
  telegramId?: number;
  userId?: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  consumedAt?: string;
}

export interface EzcordPointEvent {
  id: string;
  userId: string;
  kind: string;
  dedupeKey: string;
  points: number;
  createdAt: string;
}

export interface EzcordData {
  users: EzcordUser[];
  sessions: EzcordSession[];
  rooms: EzcordRoom[];
  peers: EzcordPeer[];
  waitingPeers: EzcordWaitingPeer[];
  signals: EzcordSignal[];
  kickedPeers: EzcordKickedPeer[];
  telegramLoginRequests: EzcordTelegramLoginRequest[];
  pointEvents: EzcordPointEvent[];
}

export interface EzcordPublicUser {
  id: string;
  email: string;
  displayName: string;
  points: number;
  telegram?: EzcordTelegramIdentity;
}

export interface EzcordTelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export type TelegramWebAppUser = EzcordTelegramUserPayload;
