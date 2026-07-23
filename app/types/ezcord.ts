export type Access = "public" | "private" | "telegram_chat";

export interface User {
  id: string;
  email: string;
  displayName: string;
  telegram?: {
    id: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
  };
}

export interface Room {
  id: string;
  name: string;
  access: Access;
  inviteUrl?: string;
  telegramChatId?: string;
  createdBy: string;
}

export interface Peer {
  peerId: string;
  userId?: string;
  displayName: string;
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
