export interface Question {
  id: string;
  revision: number;
  book_id: string;
  teacher_number: number;
  question: string;
  answer: string;
  accepted_answer_variants: string[];
  hint: string;
  explanation: string;
  choices: { id: string; text: string; correct: boolean }[];
  required_answer_parts?: string[];
}
export interface Outcome {
  id: string;
  sessionId: string;
  questionId: string;
  revision: number;
  bookId: string;
  day: string;
  time: number;
  correct: boolean;
  stage: number;
  points: number;
}
export interface Practice {
  id: string;
  clientId: string;
  questions: Question[];
  index: number;
  stage: number;
  revealed: boolean;
  started: number;
  heartbeat: number;
  activeLease: boolean;
  activeSeconds: number;
  results: Outcome[];
  mode: string;
}
export interface State {
  badgeSeen?: string[];
  badgeMuted?: boolean;
  dailySeconds?: Record<string, number>;
  practiceDays?: string[];
  trackingSince?: number;
  lastPracticedAt?: number;
  version: number;
  points: number;
  activeSeconds: number;
  read: Record<string, boolean>;
  readingConfirmed: boolean;
  outcomes: Outcome[];
  badges: Record<string, string>;
  completed: { id: string; day: string; count: number; pool: number }[];
  session: Practice | null;
  requests: string[];
  disputes: {
    questionId: string;
    revision: number;
    text: string;
    time: number;
  }[];
}
export interface Action {
  badgeIds?: string[];
  muted?: boolean;
  type: string;
  requestId: string;
  clientId?: string;
  bookId?: string;
  answer?: string;
  choiceId?: string;
  read?: boolean;
  active?: boolean;
  resetClock?: boolean;
  expectedVersion?: number;
}
