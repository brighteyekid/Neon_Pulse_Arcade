export interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  mediaType?: 'image' | 'video' | 'audio' | 'gif';
  mediaUrl?: string;
  reactions?: Reaction[];
  replyTo?: {
    id: string;
    username: string;
    text: string;
  };
  mentions?: string[];
}

export interface User {
  id: string;
  username: string;
  level?: number;
  score?: number;
  lives?: number;
  joinedAt?: number;
  lastActive?: number;
}

export interface ChatSession {
  currentUser: User | null;
  messages: Message[];
  users: User[];
}

export interface Reaction {
  emoji: string;
  userId: string;
  username: string;
} 