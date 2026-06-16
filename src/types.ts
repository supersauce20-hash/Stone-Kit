export interface Question {
  text: string;
  answers: string[];
  correctIndex: number;
}

export interface Kit {
  id?: string;
  ownerId: string;
  title: string;
  description: string;
  questions: Question[];
  createdAt: any;
  isPublic?: boolean;
}

export interface GameSettings {
  randomNicknames: boolean;
  timer: number;
}

export interface Game {
  gameCode: string;
  hostId: string;
  kitId: string;
  status: 'lobby' | 'active' | 'finished';
  settings: GameSettings;
  totalWealth: number;
  totalCorrectAnswers: number;
  winnerNickname?: string;
  bustedPlayer?: string | null;
  dreamweaver?: boolean;
  rickRollSilencer?: string | null;
  endTime?: number;
  createdAt: any;
}

export type Role = 'teacher' | 'student' | 'dual' | 'owner';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  chosenFace?: string;
  displayName: string;
  createdAt: any;
  hasCompletedTutorial?: boolean;
}

export interface StudentProfile {
  face: string;
  nickname: string;
}

export interface Player {
  id?: string;
  nickname: string;
  score: number;
  streak: number;
  highestStreak: number;
  multiplier_lvl: number;
  insurance_lvl: number;
  money_lvl: number;
  isBanned?: boolean;
  lockoutTimestamp?: number;
  joinedAt: any;
  face?: string;
}
